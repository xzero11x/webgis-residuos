"""Capa auxiliar de rótulos de calles para BAGUA MASTER.

MapLibre coloca un rótulo de línea solo si el texto cabe dentro de UN elemento de la tesela.
Overture parte las calles en tramos entre intersecciones (cientos de tramos de ~50–100 m) y
las teselas cortan algunos más, así que en la ciudad solo una fracción de las calles con nombre
recibía su rótulo a zoom 17 (ver docs/bagua-master.md, «Rótulos de calles»).

Esta capa no cambia nada de `red_vial`: es una copia de las MISMAS líneas, unidas de extremo
a extremo cuando comparten nombre, solo para colocar el texto:

  - tipo `calle`: tramos con el mismo nombre que se tocan en un extremo. El nombre es el `names.primary` de
    Overture (origen `names.primary`) o, SOLO para tramos sin él, el nombre documental recuperado del DWG
    de Tomaque (origen `dwg-tomaque`, de data/bagua-master/nombres/nombres_dwg.json). Nunca se pisa un nombre
    de Overture.
    Es exactamente el nombre del dato; no se normaliza, corrige ni completa.
  - tipo `ruta`: tramos SIN nombre de calle pero con una designación de ruta de Overture
    (`routes[]`). Es el código de la carretera, no un nombre de calle; el estilo la dibuja
    distinta y siempre indica su origen:
      · `routes[].name` tal cual, si existe (p. ej. «Ruta PE-5NC»);
      · si no, el código de ruta que forman `network` y `ref` cuando la red es
        `PE:departmental:XX` o `PE:rural:XX` → «XX-ref» (p. ej. `PE:departmental:AM` + `101`
        → «AM-101»). Es una regla de formato sobre dos campos de Overture, sin otra fuente.
    Las demás redes no se rotulan.

Las uniones solo ocurren donde exactamente dos tramos del mismo nombre se encuentran
(`shapely.ops.linemerge`); los vértices no se tocan. El script comprueba que la longitud
total y el número de vértices únicos coinciden con los tramos de origen y deja el detalle de
qué tramos forman cada línea en `calles_rotulo.manifiesto.json`.

Entrada: Parquet de Overture 2026-09-23.1 (solo lectura).
Salida: data/bagua-master/intermedio/calles_rotulo.geojsonl y su manifiesto.
Uso: .venv-gis/Scripts/python scripts/bagua-master/build_rotulos.py
"""
import hashlib
import json
import re
from pathlib import Path

import duckdb
from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.ops import linemerge

ROOT = Path(__file__).resolve().parents[2]
PARQUET = ROOT / 'data/bagua-master/descarga/2026-09-23.1/transportation_segment.parquet'
NAMES_DWG = ROOT / 'data/bagua-master/nombres/nombres_dwg.json'
OUT = ROOT / 'data/bagua-master/intermedio/calles_rotulo.geojsonl'
MANIFEST = ROOT / 'data/bagua-master/intermedio/calles_rotulo.manifiesto.json'
GEOD = Geod(ellps='WGS84')
ROUTE_NETWORK = re.compile(r'^PE:(departmental|rural):([A-Z]{2})$')
RANK = {'motorway': 4, 'trunk': 4, 'primary': 4, 'secondary': 3, 'tertiary': 3, 'residential': 2,
        'unclassified': 2, 'unknown': 2, 'service': 1, 'living_street': 1}  # el resto (senderos): 0


def route_label(routes):
    """(texto, origen) de la designación de ruta de un tramo, o None."""
    for route in routes or []:
        if route.get('name'):
            return route['name'], 'routes.name'
    for route in routes or []:
        match = ROUTE_NETWORK.match(route.get('network') or '')
        if match and route.get('ref'):
            return f"{match.group(2)}-{route['ref']}", 'routes.network+ref'
    return None


def length_m(geometry):
    return sum(abs(GEOD.geometry_length(part)) for part in getattr(geometry, 'geoms', [geometry]))


def vertices(geometry):
    return {(round(x, 9), round(y, 9)) for part in getattr(geometry, 'geoms', [geometry]) for x, y in part.coords}


def recovered_names():
    """Nombres documentales del DWG de Tomaque por id de tramo (conjunto independiente, sin tocar Overture)."""
    if not NAMES_DWG.exists():
        return {}
    data = json.loads(NAMES_DWG.read_text(encoding='utf8'))
    if data['version_overture'] != '2026-09-23.1':
        raise SystemExit('nombres_dwg.json es de otra versión de Overture: ejecute nombres_dwg.py de nuevo.')
    return data['asociaciones']


def main():
    recovered = recovered_names()
    con = duckdb.connect()
    con.execute('INSTALL spatial; LOAD spatial;')
    rows = con.execute(
        f"""SELECT id, class, names.primary, routes, ST_AsGeoJSON(geometry)
            FROM read_parquet('{PARQUET.as_posix()}')
            WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
            ORDER BY id"""
    ).fetchall()
    groups = {}
    used_recovered = 0
    for sid, clase, nombre, routes, geojson in rows:
        # Prioridad: nombre de Overture > nombre recuperado del DWG > designación de ruta > sin rótulo.
        if nombre and nombre.strip():
            key = ('calle', nombre, 'names.primary')
        elif sid in recovered:
            key = ('calle', recovered[sid]['nombre'], 'dwg-tomaque')
            used_recovered += 1
        else:
            label = route_label(routes)
            if not label:
                continue
            key = ('ruta', label[0], label[1])
        groups.setdefault(key, []).append((sid, clase, shape(json.loads(geojson))))

    unknown = set(recovered) - {r[0] for r in rows}
    native = {r[0] for r in rows if r[2] and r[2].strip()}
    if unknown or set(recovered) & native:
        raise SystemExit('Hay nombres recuperados para tramos inexistentes o que ya tienen nombre en Overture.')

    features, checks, detail = [], {'tramos': 0, 'longitud_origen_m': 0.0, 'longitud_salida_m': 0.0,
                                     'vertices_origen': 0, 'vertices_salida': 0}, []
    for (tipo, nombre, origen), members in sorted(groups.items()):
        merged = linemerge([g for _, _, g in members])
        parts = list(getattr(merged, 'geoms', [merged]))
        rank = max(RANK.get(clase, 0) for _, clase, _ in members)
        for n, part in enumerate(parts):
            props = {'tipo': tipo, 'nombre': nombre, 'origen': origen, 'rango': 4 if tipo == 'ruta' else rank}
            features.append({'type': 'Feature', 'properties': props, 'geometry': mapping(part)})
        source_vertices = set().union(*(vertices(g) for _, _, g in members))
        out_vertices = set().union(*(vertices(p) for p in parts))
        src_len = sum(length_m(g) for _, _, g in members)
        out_len = sum(length_m(p) for p in parts)
        checks['tramos'] += len(members)
        checks['longitud_origen_m'] += src_len
        checks['longitud_salida_m'] += out_len
        checks['vertices_origen'] += len(source_vertices)
        checks['vertices_salida'] += len(out_vertices)
        if abs(src_len - out_len) > 0.01 or source_vertices != out_vertices:
            raise SystemExit(f'La unión alteró la geometría de «{nombre}»: {src_len:.3f} m → {out_len:.3f} m')
        detail.append({'tipo': tipo, 'nombre': nombre, 'origen': origen, 'tramos': len(members), 'lineas': len(parts),
                       'ids': [sid for sid, _, _ in members]})
    with OUT.open('w', encoding='utf8', newline='\n') as stream:
        for feature in features:
            stream.write(json.dumps(feature, ensure_ascii=False) + '\n')
    summary = {
        'archivo': OUT.name,
        'sha256': hashlib.sha256(OUT.read_bytes()).hexdigest(),
        'lineas': len(features),
        'por_tipo': {t: sum(1 for f in features if f['properties']['tipo'] == t) for t in ('calle', 'ruta')},
        'nombres_distintos': {t: sum(1 for k in groups if k[0] == t) for t in ('calle', 'ruta')},
        'calles_por_origen': {o: {'tramos': sum(len(v) for k, v in groups.items() if k[0] == 'calle' and k[2] == o),
                                  'lineas': sum(1 for f in features if f['properties']['tipo'] == 'calle'
                                                and f['properties']['origen'] == o)}
                              for o in ('names.primary', 'dwg-tomaque')},
        'rutas_por_origen': {o: sum(len(v) for k, v in groups.items() if k[0] == 'ruta' and k[2] == o)
                             for o in ('routes.name', 'routes.network+ref')},
        'rutas_sin_rotulo': sum(1 for sid, clase, nombre, routes, _ in rows
                                if not (nombre and nombre.strip()) and routes and not route_label(routes)),
        'comprobaciones': {k: round(v, 3) if isinstance(v, float) else v for k, v in checks.items()},
        'detalle': detail,
    }
    MANIFEST.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps({k: v for k, v in summary.items() if k != 'detalle'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
