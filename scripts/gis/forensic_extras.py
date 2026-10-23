"""Third pass, part 6: complementary structured extractions (deliverable B).

Writes data/cad/extracted/tercera/complementos/*.geojson from the forensic outputs
and the first-pass raw export. Every feature keeps the CAD handle, layer, source,
drawing coordinates and how its 4326 position was obtained. Nothing is merged
with earlier layers: a 'previously' field says whether an earlier pass already
published an equivalent record.

- rpu.geojson: every entity carrying RPU_GRAFICOS street names (lots, blocks, lines).
- vertices-numerados.geojson: circles tagged with the VERTICES application (numbered
  boundary vertices of construction tables).
- regiones.geojson: REGION entities decoded from ACIS (forensic_dxf.py).
- perdidos.geojson: model-space or world-coordinate objects recovered from the
  native DWG that the ODA export dropped (forensic_lost.py).
- anotaciones-operativas.geojson: model-space texts with times, days, frequencies
  or service words, as extracted (no schedule is inferred).
"""
from collections import Counter
import gzip
import json
import re
from pyproj import Transformer
from sources import ROOT

EXT = ROOT / 'data/cad/extracted'
T3 = EXT / 'tercera'
OUT = T3 / 'complementos'
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)
PLACEMENT = {
    'RUTAS CON TIEMPO.dwg': ((0.0, 0.0), 'declarado'), 'RUTAS bagua.dwg': ((0.0, 0.0), 'declarado'),
    'RUTA ORGANICO.dwg': ((0.0, 0.0), 'declarado'), 'RUTA LIMPIO.dwg': ((0.0, 0.0), 'declarado'),
    'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg': ((3.589, 2.352), 'adoptado'),
    'COFOPRI BAGUA.dwg': ((-250.301, -376.509), 'adoptado'),
}
REGION = (760000, 9360000, 800000, 9395000)


def stem(name):
    return re.sub(r'[^\w.-]+', '_', name)


def wgs(source, pts):
    (dx, dy), _ = PLACEMENT[source]
    moved = [(p[0] + dx, p[1] + dy) for p in pts]
    if not all(REGION[0] < x < REGION[2] and REGION[1] < y < REGION[3] for x, y in moved):
        return None
    return [[round(v, 8) for v in TO_WGS.transform(x, y)] for x, y in moved]


def feature(coords, gtype, props):
    if coords is None:
        geometry = None
    elif gtype == 'Point':
        geometry = {'type': 'Point', 'coordinates': coords[0]}
    elif gtype == 'Polygon':
        ring = coords if coords[0] == coords[-1] else coords + [coords[0]]
        geometry = {'type': 'Polygon', 'coordinates': [ring]}
    else:
        geometry = {'type': 'LineString', 'coordinates': coords}
    return {'type': 'Feature', 'geometry': geometry, 'properties': props}


def write(name, features):
    (OUT / name).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False), encoding='utf8')
    return len(features)


def rpu_and_vertices(source):
    rpu, vertices = [], []
    _, status = PLACEMENT[source]
    with gzip.open(EXT / f'{source}.dxf.raw.jsonl.gz', 'rt', encoding='utf8') as s:
        for line in s:
            r = json.loads(line)
            xd = r.get('xdata') or {}
            a = r['attributes']
            if 'RPU_GRAFICOS' in xd:
                raw = ''.join(str(v) for c, v in xd['RPU_GRAFICOS'] if c == 1000)
                sides = [x.strip('#').strip() for x in raw.split('#@')]
                if r['type'] == 'LWPOLYLINE':
                    pts = [[v[0], v[1]] for v in r['vertices_xyseb']]
                    gtype = 'Polygon' if a.get('flags', 0) & 1 or len(pts) > 2 and pts[0] == pts[-1] else 'LineString'
                elif r['type'] == 'LINE':
                    pts, gtype = [a['start'][:2], a['end'][:2]], 'LineString'
                else:
                    continue
                rpu.append(feature(wgs(source, pts), gtype, {
                    'source': source, 'handle': a['handle'], 'layer': a.get('layer'), 'cad_type': r['type'],
                    'calles_por_lado': [x for x in sides if x], 'lados_sin_calle': sum(1 for x in sides if not x),
                    'previously': 'segunda pasada (manzanas.geojson)' if a.get('layer') == 'Limite Manzana' else 'nuevo en la tercera pasada',
                    'drawing_coordinates': pts, 'crs': status, 'dato': 'extraido (xdata RPU_GRAFICOS)',
                    'interpretacion': 'calles colindantes declaradas en el CAD; lado/orden sin validar'}))
            if 'VERTICES' in xd and r['type'] == 'CIRCLE':
                c = a['center'][:2]
                vertices.append(feature(wgs(source, [c]), 'Point', {
                    'source': source, 'handle': a['handle'], 'layer': a.get('layer'),
                    'vertice': next((v for code, v in xd['VERTICES'] if code == 1000), None), 'radio': a.get('radius'),
                    'drawing_coordinates': c, 'crs': status, 'dato': 'extraido (xdata VERTICES)',
                    'interpretacion': 'vértice numerado de un cuadro de construcción; predio asociado pendiente'}))
    return rpu, vertices


def regions(source):
    path = T3 / 'dxf' / f'{stem(source)}.regions.jsonl.gz'
    out = []
    if not path.exists():
        return out
    for line in gzip.open(path, 'rt', encoding='utf8'):
        r = json.loads(line)
        for i, loop in enumerate(r.get('loops') or []):
            pts = [[p[0], p[1]] for p in loop]
            out.append(feature(wgs(source, pts) if len(pts) > 2 else None, 'Polygon', {
                'source': source, 'handle': r['handle'], 'loop': i, 'layer': r['layer'], 'cad_type': r['type'],
                'owner': r['owner'], 'curve_types': r.get('curve_types'), 'drawing_coordinates': pts,
                'crs': PLACEMENT[source][1], 'dato': 'derivado (ACIS SAB decodificado con ezdxf.acis)',
                'interpretacion': 'contorno de REGION; significado pendiente'}))
    return out


def lost(source):
    path = T3 / 'perdidos' / f'{stem(source)}.json'
    out = []
    if not path.exists():
        return out
    for e in json.loads(path.read_text(encoding='utf8'))['entidades']:
        g = e['geometry_drawing']
        if not g:
            continue
        c = g['coordinates']
        pts = [c[:2]] if g['type'] == 'Point' else [p[:2] for p in (c[0] if g['type'] == 'Polygon' else c)]
        position = wgs(source, pts) if e['space'] == 'model' or e['space'].startswith('bloque perdido:*D') else None
        out.append(feature(position, g['type'], {
            'source': source, 'handle': e['handle'], 'layer': e['layer'], 'cad_type': e['type'], 'space': e['space'],
            'text': e['text'], 'text_withheld': e['text_withheld'], 'drawing_coordinates': pts,
            'crs': PLACEMENT[source][1] if position else 'sin posición: coordenadas de bloque/hoja',
            'dato': 'extraido del DWG nativo (ausente en el DXF de ODA)',
            'interpretacion': 'bloques *D: gráficos de cota en coordenadas del dibujo; *X/*U: sin interpretar'}))
    return out


def operative(source):
    path = T3 / 'dxf' / f'{stem(source)}.operativas.jsonl.gz'
    out = []
    if not path.exists():
        return out
    for line in gzip.open(path, 'rt', encoding='utf8'):
        r = json.loads(line)
        ins = r.get('insert')
        model = r['space'] == 'model'
        out.append(feature(wgs(source, [ins[:2]]) if ins and model else None, 'Point', {
            'source': source, 'handle': r['handle'], 'layer': r['layer'], 'space': r['space'], 'cad_type': r['type'],
            'text': r['text'], 'crs': PLACEMENT[source][1] if model else 'hoja o bloque',
            'dato': 'extraido (texto)', 'interpretacion': 'horario/frecuencia no inferido; solo texto y posición'}))
    return out


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    totals = Counter()
    rpu_all, vert_all, reg_all, lost_all, op_all = [], [], [], [], []
    for src in PLACEMENT:
        rpu, vert = rpu_and_vertices(src)
        rpu_all += rpu
        vert_all += vert
        reg_all += regions(src)
        lost_all += lost(src)
        op_all += operative(src)
    totals['rpu'] = write('rpu.geojson', rpu_all)
    totals['vertices_numerados'] = write('vertices-numerados.geojson', vert_all)
    totals['regiones'] = write('regiones.geojson', reg_all)
    totals['perdidos'] = write('perdidos.geojson', lost_all)
    totals['anotaciones_operativas'] = write('anotaciones-operativas.geojson', op_all)
    summary = {'totales': dict(totals),
               'rpu_por_capa': [{'layer': l, 'previously': p, 'count': n} for (l, p), n in
                                Counter((f['properties']['layer'], f['properties']['previously']) for f in rpu_all).most_common()],
               'perdidos_con_posicion': sum(1 for f in lost_all if f['geometry']),
               'operativas_por_fuente': dict(Counter(f['properties']['source'] for f in op_all)),
               'operativas_con_posicion': sum(1 for f in op_all if f['geometry'])}
    (OUT / 'resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps(summary, ensure_ascii=False))
