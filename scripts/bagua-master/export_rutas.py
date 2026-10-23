"""Instantánea de las rutas municipales documentadas para BAGUA MASTER (solo lectura).

Lee del paquete municipal ya importado (`public.rutas` y `public.municipal_cartography`) SIN
modificarlo y escribe `data/bagua-master/rutas/rutas.json`, que importa el módulo BAGUA MASTER en
su propio esquema. No reconstruye rutas ni vuelve a procesar DWG: los trazos se copian tal cual,
sin ajustarlos a las calles de Overture.

FUENTE ÚNICA: DWG. Solo se publican rutas, flechas y marcadores cuyo archivo de origen es un DWG
municipal. Las rutas cuya geometría procede de un PDF, y los símbolos extraídos de PDF, quedan fuera
del catálogo (se listan en `excluidas` solo para trazabilidad) y los PDF siguen archivados sin uso como
fuente activa. Los atributos de las rutas DWG que remitían a un PDF (p. ej. «contrastada con el PDF»)
se retiran sin sustituirlos; el script falla si queda cualquier mención a un PDF.

Flechas: solo las que el paquete municipal asoció a una ruta de forma inequívoca (proximidad
exclusiva al trazo). Aquí se verifica además que el eje del triángulo siga la dirección local del
trazo; las que no lo hacen se conservan marcadas como no verificadas y no se dibujan. Los
triángulos casi coincidentes de una misma ruta (mismo símbolo dibujado dos veces) se cuentan una vez.
Donde una ruta no tiene flechas no se inventa ningún sentido.

Uso: python scripts/bagua-master/export_rutas.py
"""

import collections
import json
import math
import re
import subprocess
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/bagua-master/rutas/rutas.json'
M_LON = 111320 * math.cos(math.radians(5.64))
M_LAT = 110574
DIST_FLECHA_M = 12.0  # mismo umbral que el paquete municipal para asociar símbolo y trazo
ANGULO_FLECHA = 25.0  # eje del triángulo frente a la dirección local del trazo
DUPLICADA_M = 3.0
DUPLICADA_ANGULO = 20.0

SQL = """
SELECT json_build_object(
 'rutas', (SELECT json_agg(json_build_object(
     'codigo', codigo, 'nombre', nombre, 'color', color, 'origen', origen, 'metadata', metadata,
     'longitud_trazos_m', round(ST_Length(geom_original)::numeric, 1),
     'geometria', ST_AsGeoJSON(geom, 8)::json) ORDER BY codigo)
   FROM public.rutas WHERE NOT is_demo),
 'simbolos', (SELECT json_agg(json_build_object(
     'id', id, 'tipo', kind, 'propiedades', properties, 'punto', ST_AsGeoJSON(geom, 8)::json) ORDER BY id)
   FROM public.municipal_cartography
   WHERE kind IN ('sentido','inicio','fin','parada') AND geom IS NOT NULL)
);
"""


def metres(lon, lat):
    return ((lon + 78.5) * M_LON, (lat + 5.64) * M_LAT)


def to_metric_line(geometry):
    lines = []
    for coords in geometry.geoms if geometry.geom_type == 'MultiLineString' else [geometry]:
        lines.append([metres(x, y) for x, y in coords.coords])
    return lines


def tangent_at(lines, point):
    """Dirección (grados, 0 = norte, sentido horario) del trazo más cercano y distancia en metros."""
    from shapely.geometry import LineString

    best = None
    for coords in lines:
        line = LineString(coords)
        d = line.distance(point)
        if best is None or d < best[0]:
            best = (d, line)
    d, line = best
    s = line.project(point)
    a = line.interpolate(max(s - 1.0, 0))
    b = line.interpolate(min(s + 1.0, line.length))
    return math.degrees(math.atan2(b.x - a.x, b.y - a.y)) % 360, d


def axis_diff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def is_dwg(name):
    return str(name or '').lower().endswith('.dwg')


PDF_CLAUSE = re.compile(r',?\s*contrastad[ao] con el PDF[^.;]*', re.IGNORECASE)


def without_pdf(value):
    """Quita de un texto la cláusula que remite a un PDF (no se sustituye por nada)."""
    return PDF_CLAUSE.sub('', value).strip() if isinstance(value, str) else value


def mentions_pdf(value):
    return bool(re.search(r'pdf', json.dumps(value, ensure_ascii=False), re.IGNORECASE))


def sector(layer):
    return layer.removeprefix('SECT. ').strip().title() if layer.startswith('SECT.') else None


def main():
    raw = subprocess.run(
        ['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
         'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'],
        input=SQL, capture_output=True, text=True, encoding='utf-8', cwd=ROOT, check=True,
    ).stdout
    data = json.loads(raw)
    # Fuente única DWG: una ruta cuyo archivo de origen no es un DWG no entra en el catálogo.
    excluded = [
        {'codigo': r['codigo'], 'nombre': r['nombre'], 'fuente_archivo': r['metadata']['source'],
         'motivo': 'Geometría procedente exclusivamente de un PDF (fuente no activa)'}
        for r in data['rutas'] if not is_dwg(r['metadata']['source'])
    ]
    routes = [r for r in data['rutas'] if is_dwg(r['metadata']['source'])]
    lines = {r['codigo']: to_metric_line(shape(r['geometria'])) for r in routes}

    arrows, markers, sectors = [], [], collections.defaultdict(set)
    pdf_symbols = collections.Counter()
    for s in data['simbolos']:
        p = s['propiedades']
        code = p.get('routeCode') or ''
        if code not in lines:
            if code and not is_dwg(p.get('source')):
                pdf_symbols[(code, s['tipo'])] += 1
            continue
        if not is_dwg(p.get('source')):
            pdf_symbols[(code, s['tipo'])] += 1
            continue
        layer = p.get('layer') or ''
        if sector(layer):
            sectors[code].add(sector(layer))
        lon, lat = s['punto']['coordinates']
        if s['tipo'] != 'sentido':
            markers.append({'id': s['id'], 'ruta': code, 'tipo': s['tipo'], 'lon': lon, 'lat': lat,
                            'nombre': p['nombre'], 'capa': layer, 'fuente': p['source']})
            continue
        direction, dist = tangent_at(lines[code], Point(*metres(lon, lat)))
        rumbo = p['bearing'] % 360
        diff = axis_diff(rumbo, direction)
        arrows.append({'id': s['id'], 'ruta': code, 'lon': lon, 'lat': lat, 'rumbo': round(rumbo, 1),
                       'fuente': p['source'], 'capa': layer, 'distancia_trazo_m': round(dist, 2),
                       'alineacion_grados': round(diff, 1),
                       'verificada': dist <= DIST_FLECHA_M and diff <= ANGULO_FLECHA,
                       'duplicada_de': None})
    # Triángulos casi coincidentes de una misma ruta: se cuenta una vez.
    keep = sorted(arrows, key=lambda a: a['id'])
    placed = []
    for a in keep:
        for b in placed:
            if (a['ruta'] == b['ruta']
                    and math.dist(metres(a['lon'], a['lat']), metres(b['lon'], b['lat'])) <= DUPLICADA_M
                    and axis_diff(a['rumbo'], b['rumbo']) <= DUPLICADA_ANGULO):
                a['duplicada_de'] = b['id']
                break
        else:
            placed.append(a)

    out_routes = []
    for r in routes:
        m = r['metadata']
        code = r['codigo']
        views = [v['name'] for v in m.get('views', [])]
        mine = [a for a in arrows if a['ruta'] == code]
        out_routes.append({
            'codigo': code,
            'nombre': r['nombre'],
            'color': r['color'],
            'estado': m['status'],
            'fuente_archivo': m['source'],
            'fuente_sha256': m.get('sha256') or '',
            'nota': without_pdf(m['note']),
            'advertencias': [without_pdf(w) for w in m.get('warnings', [])],
            'sectores': sorted(sectors[code]) + [v for v in views if v not in sectors[code]],
            'crs': m['sourceCrs'],
            'segmentos': m['segments'],
            'longitud_trazos_m': r['longitud_trazos_m'],
            'significado_longitud': m['lengthMeaning'],
            'horario_estado': m['scheduleStatus'],
            'sentido_estado': m['directionStatus'],
            'flechas': {
                'recuperadas': len(mine),
                'dibujadas': sum(1 for a in mine if a['verificada'] and not a['duplicada_de']),
                'no_verificadas': sum(1 for a in mine if not a['verificada']),
                'duplicadas': sum(1 for a in mine if a['duplicada_de']),
            },
            'procedencia': {
                'trazos': m['source'],
                'flechas': sorted({a['fuente'] for a in mine}),
                'marcadores': sorted({k['fuente'] for k in markers if k['ruta'] == code}),
            },
            'geometria': r['geometria'],
        })
    # Orden de presentación: rutas con identificación documental primero.
    order = ['MUN-1001', 'MUN-2001', 'MUN-2002', 'CAD-2026']
    out_routes.sort(key=lambda r: (order.index(r['codigo']) if r['codigo'] in order else 99, r['codigo']))

    payload = {
        'fuente': 'Paquete municipal importado (public.rutas, public.municipal_cartography), lectura sin cambios',
        'politica_fuentes': 'Solo DWG municipales. Los PDF no son fuente activa de rutas.',
        'excluidas': excluded,
        'simbolos_pdf_omitidos': [{'ruta': k[0], 'tipo': k[1], 'cantidad': n}
                                  for k, n in sorted(pdf_symbols.items())],
        'aviso': ('Trazados documentales de planos municipales: no se ajustan a las calles de Overture, '
                  'no acreditan vigencia operativa ni precisión topográfica.'),
        'parametros': {'distancia_flecha_m': DIST_FLECHA_M, 'angulo_flecha': ANGULO_FLECHA,
                       'duplicada_m': DUPLICADA_M, 'duplicada_angulo': DUPLICADA_ANGULO},
        'rutas': out_routes,
        'flechas': arrows,
        'marcadores': markers,
    }
    # Comprobación final: nada publicado puede proceder de un PDF ni mencionarlo.
    published = {'rutas': [{k: v for k, v in r.items() if k != 'geometria'} for r in out_routes],
                 'flechas': arrows, 'marcadores': markers}
    if mentions_pdf(published):
        raise SystemExit('Quedan menciones a PDF en lo que se publicaría: revise el origen.')
    if not all(is_dwg(x['fuente']) for x in arrows + markers):
        raise SystemExit('Hay flechas o marcadores que no proceden de un DWG.')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True), encoding='utf-8')
    for r in out_routes:
        print(r['codigo'], r['estado'], r['longitud_trazos_m'], r['flechas'], r['sectores'])
    print('excluidas', [e['codigo'] for e in excluded], 'simbolos_pdf_omitidos', dict(pdf_symbols))
    print('flechas', len(arrows), 'verificadas', sum(a['verificada'] for a in arrows),
          'duplicadas', sum(1 for a in arrows if a['duplicada_de']), 'marcadores', len(markers),
          'alineacion_max', max(a['alineacion_grados'] for a in arrows),
          'distancia_max', max(a['distancia_trazo_m'] for a in arrows))


if __name__ == '__main__':
    main()
