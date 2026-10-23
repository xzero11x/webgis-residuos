"""Derive GIS layers from the second-pass audit (deep_audit.py).

Outputs in data/cad/gis/segunda-pasada/ (EPSG:4326, original UTM kept in properties):

- tomaque-alineacion.json   translation that aligns RUTA TOMAQUE to the EPSG:32717 CAD
- hojas-planos.geojson      model window of every layout viewport + title-block texts
- puntos-topograficos.geojson  survey points (P/D/Z) from model space and unused blocks
- manzanas.geojson          'Limite Manzana' outlines with RPU_GRAFICOS street names
- etiquetas-lote.geojson.gz lot numbers and frontage labels, with EGPT_EPOD codes
- rutas-bloques.geojson     route sketches kept only in never-inserted blocks
- toponimia.geojson         streets, sectors, institutions and water names
- cotas.geojson             DIMENSION measurements
- resumen.json              counts, QA and caveats

Rules: no owner or person names are published; title-block lines are kept only
when they match technical patterns. Geometry is never snapped or repaired. Every
derived position states how its CRS was established.
"""
from pathlib import Path
from collections import Counter, defaultdict
import gzip
import json
import math
import re
import statistics
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'data/cad/extracted'
DEEP = EXT / 'deep'
OUT = ROOT / 'data/cad/gis/segunda-pasada'
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)
TOMAQUE = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'
REFERENCE = 'RUTAS CON TIEMPO.dwg'
ROUTE_DWGS = ['RUTAS CON TIEMPO.dwg', 'RUTAS bagua.dwg', 'RUTA ORGANICO.dwg', 'RUTA LIMPIO.dwg']
DWGS = ROUTE_DWGS + [TOMAQUE]
CITY_BOX = (771000, 9374000, 777000, 9379000)      # where the Tomaque shift was verified
REGION_BOX = (760000, 9360000, 800000, 9395000)    # anything beyond is a stray copy
SHEET_TEXT = re.compile(
    r'(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SET|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\W*\d{4}'
    r'|^ESC|1/\d+|^PLANO|^SECTOR|^RUTA|DATUM|ZONA|U\s*T\s*M|IMPRIMIR|^[A-Z]{1,6}-\d+$|LOTIZACION|CERRO|^MUNICIPALIDAD'
    r'|^RECOLECCI|^\d{2}/\d{2}/\d{4}$|^AREA\s*=|^SECCION VIAL|^PSREC', re.I)
LAND_USE = re.compile(r'^(COMERCIO|EDUCACION|PARQUE|OTROS USOS|SERV\.?\s*COMUNALES|RECREACION|AREA VERDE|SALUD|RESERVA|INDUSTRIA|VIVIENDA)\b', re.I)
URBAN_Z = (380.0, 600.0)  # plausible terrain heights in Bagua (m)
CLASSES = [
    ('calle', re.compile(r'^(JR|JIRON|AV|AVENIDA|CALLE|CA|PSJE|PASAJE|PJE|PROLONG|PROL|CARRETERA|CARR|MALECON|CAMINO|TROCHA)\b\.?', re.I)),
    ('sector', re.compile(r'^(SECTOR|SECT|SEC|URB|URBANIZACION|AA\.?\s?HH|ASENTAMIENTO|P\.?\s?J|PUEBLO JOVEN|BARRIO|CASERIO|LOTIZACION|HABILITACION|CENTRO POBLADO|C\.\s?P)\b\.?', re.I)),
    ('institucion', re.compile(r'\b(I\.?\s?E\.?\s?[IP]?\.?|COLEGIO|ESCUELA|INICIAL|JARDIN|HOSPITAL|CENTRO DE SALUD|POSTA|MERCADO|PARQUE|PLAZA|IGLESIA|MUNICIPALIDAD|COMISARIA|ESTADIO|CEMENTERIO|LOSA|LOZA|UNIVERSIDAD|INSTITUTO|CAMAL|GRIFO|BANCO|ESSALUD|SUNARP|RENIEC|POLIDEPORTIVO|COLISEO|ALBERGUE|ALVERGUE|BIBLIOTECA|CUNA|PRONOEI)\b', re.I)),
    ('hidrografia', re.compile(r'^(RIO|QUEBRADA|QDA|CANAL|ACEQUIA|LAGUNA)\b\.?', re.I)),
]


def read_jsonl(path):
    with gzip.open(path, 'rt', encoding='utf8') as stream:
        for line in stream:
            yield json.loads(line)


def points_of(geometry):
    if not geometry:
        return []
    c = geometry['coordinates']
    if geometry['type'] == 'Point':
        return [c]
    if geometry['type'] == 'Polygon':
        return c[0]
    return c


def inside(p, box):
    return box[0] < p[0] < box[2] and box[1] < p[1] < box[3]


class Placement:
    """Model coordinates of one source -> EPSG:32717 -> EPSG:4326."""

    def __init__(self, shift=(0.0, 0.0), status='GEODATA EPSG:32717 declarado en el DWG'):
        self.dx, self.dy = shift
        self.status = status

    def utm(self, p):
        return [p[0] + self.dx, p[1] + self.dy]

    def wgs(self, p):
        x, y = self.utm(p)
        lon, lat = TO_WGS.transform(x, y)
        return [round(lon, 8), round(lat, 8)]

    def crs_note(self, p):
        if self.dx == 0 and self.dy == 0:
            return self.status
        verified = inside(self.utm(p), CITY_BOX)
        return self.status + ('' if verified else '; fuera del área donde se verificó la traslación')


def feature(geometry, props):
    return {'type': 'Feature', 'geometry': geometry, 'properties': props}


def write_geojson(name, features, compress=False):
    data = json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, separators=(',', ':'))
    path = OUT / name
    if compress:
        with gzip.open(path, 'wt', encoding='utf8') as s:
            s.write(data)
    else:
        path.write_text(data, encoding='utf8')
    return len(features)


# ---------------------------------------------------------------- Tomaque shift
def vertex_grid(records, cell):
    grid = defaultdict(list)
    for r in records:
        g = r.get('geometry')
        if not g or g['type'] == 'Point' or r['type'] not in ('LWPOLYLINE', 'LINE', 'POLYLINE'):
            continue
        for p in points_of(g):
            if inside(p, CITY_BOX):
                grid[(int(p[0] // cell), int(p[1] // cell))].append((p[0], p[1]))
    return grid


def nearest(grid, cell, x, y, tol):
    best, bd = None, tol
    cx, cy = int(x // cell), int(y // cell)
    reach = max(1, math.ceil(tol / cell))
    for dx in range(-reach, reach + 1):
        for dy in range(-reach, reach + 1):
            for q in grid.get((cx + dx, cy + dy), ()):
                d = math.hypot(q[0] - x, q[1] - y)
                if d < bd:
                    bd, best = d, q
    return best, bd


TOMAQUE_NOTE = ('Traslación uniforme de pocos metros respecto al CAD con GEODATA EPSG:32717. '
                'Es incompatible con PSAD56 (≈450 m), aunque los cajetines de Tomaque rotulen PSAD 56. '
                'Los rótulos de datum no describen las coordenadas actuales del dibujo.')


def estimate_shift(source=TOMAQUE, interpretation=TOMAQUE_NOTE):
    """Coarse vote on integer offsets (±600 m), then a 2 m nearest-vertex refinement."""
    ref = list(read_jsonl(EXT / f'{REFERENCE}.dxf.entities.jsonl.gz'))
    tom = list(read_jsonl(EXT / f'{source}.dxf.entities.jsonl.gz'))
    ref_grid = vertex_grid(ref, 50)
    tom_pts = [p for cell in vertex_grid(tom, 50).values() for p in cell]
    votes = Counter()
    for p in tom_pts[::max(1, len(tom_pts) // 1500)]:
        for dx in range(-12, 13):
            for dy in range(-12, 13):
                for q in ref_grid.get((int(p[0] // 50) + dx, int(p[1] // 50) + dy), ()):
                    votes[(round((q[0] - p[0]) / 2) * 2, round((q[1] - p[1]) / 2) * 2)] += 1
    (cx, cy), _ = votes.most_common(1)[0]
    fine = vertex_grid(ref, 10)
    offsets = []
    for p in tom_pts:
        q, _ = nearest(fine, 10, p[0] + cx, p[1] + cy, 2.0)
        if q:
            offsets.append((q[0] - p[0], q[1] - p[1]))
    dx = statistics.median(o[0] for o in offsets)
    dy = statistics.median(o[1] for o in offsets)
    exact = [o for o in offsets if abs(o[0] - dx) < 0.05 and abs(o[1] - dy) < 0.05]
    residual = [math.hypot(o[0] - dx, o[1] - dy) for o in exact]
    tiles = defaultdict(list)
    for p in tom_pts:
        q, _ = nearest(fine, 10, p[0] + dx, p[1] + dy, 0.05)
        if q:
            tiles[(int(p[0] // 1000) * 1000, int(p[1] // 1000) * 1000)].append((q[0] - p[0], q[1] - p[1]))
    psad = Transformer.from_crs(24877, 32717, always_xy=True)
    ox = statistics.median(p[0] for p in tom_pts)
    oy = statistics.median(p[1] for p in tom_pts)
    px, py = psad.transform(ox, oy)
    return {
        'source': source, 'reference': REFERENCE,
        'translation_m': {'dE': round(dx, 3), 'dN': round(dy, 3)},
        'coarse_vote_peak': [cx, cy],
        'vertices_compared': len(tom_pts), 'vertices_matched_2m': len(offsets),
        'vertices_within_5cm': len(exact), 'rms_within_5cm_m': round(math.sqrt(sum(r * r for r in residual) / len(residual)), 4) if residual else None,
        'tiles_1km': [{'E': k[0], 'N': k[1], 'matches': len(v), 'dE': round(statistics.median(a for a, _ in v), 3),
                       'dN': round(statistics.median(b for _, b in v), 3)} for k, v in sorted(tiles.items()) if len(v) >= 30],
        'psad56_expected_shift_m': {'dE': round(px - ox, 1), 'dN': round(py - oy, 1)},
        'verified_box_utm': CITY_BOX,
        'interpretation': interpretation,
    }


# ---------------------------------------------------------------- sheets
def scale_label(ppm):
    if not ppm:
        return None
    return f'1:{round(1000 / ppm):,}'.replace(',', '.')


def sheets(placements):
    features = []
    for src in DWGS:
        deep = json.loads((DEEP / f'{src}.deep.json').read_text(encoding='utf8'))
        place = placements[src]
        for layout in deep['layouts']:
            texts = []
            for t in layout['texts']:
                t = ' '.join(t.split())
                if t and SHEET_TEXT.search(t) and t not in texts:
                    texts.append(t)
            for vp in layout['viewports']:
                w = vp.get('model_window')
                if not w or vp.get('id') == 1:
                    continue
                corners = [[w[0], w[1]], [w[2], w[1]], [w[2], w[3]], [w[0], w[3]], [w[0], w[1]]]
                if not all(inside(p, REGION_BOX) for p in corners):
                    continue
                features.append(feature(
                    {'type': 'Polygon', 'coordinates': [[place.wgs(p) for p in corners]]},
                    {'fuente': src, 'hoja': layout['name'], 'ventana': vp['id'],
                     'escala_aprox': scale_label(vp['paper_per_model_unit']),
                     'giro_grados': vp.get('twist_angle') or 0,
                     'capas_congeladas': len(vp.get('frozen_layers') or []),
                     'rotulos_tecnicos': texts, 'crs': place.crs_note(corners[0]),
                     'ventana_utm': [round(v, 2) for v in place.utm(w[:2]) + place.utm(w[2:])],
                     'nota': 'Ventana de vista del modelo; no es un límite administrativo.'}))
    return features


# ---------------------------------------------------------------- survey points
def survey_points(placements):
    seen, features = set(), []
    rejected = Counter()
    for src in DWGS:
        place = placements[src]
        groups = [('modelo', read_jsonl(DEEP / f'{src}.model-extras.jsonl.gz')),
                  ('bloque no insertado', read_jsonl(DEEP / f'{src}.unused-blocks.jsonl.gz'))]
        for origin, records in groups:
            nodes, labels = [], defaultdict(list)
            if origin == 'modelo':
                # Model-space labels are in the first-pass extraction (2D only).
                for r in read_jsonl(EXT / f'{src}.dxf.entities.jsonl.gz'):
                    if r['layer'] == 'V-NODE-TEXT' and r.get('text') and r.get('geometry'):
                        p = r['geometry']['coordinates']
                        labels[(round(p[0]), round(p[1]))].append(([p[0], p[1], None], r['text'].strip()))
            for r in records:
                g = r.get('geometry')
                if not g or g['type'] != 'Point':
                    continue
                if r['type'] == 'INSERT' and r['layer'] == 'V-NODE':
                    nodes.append((r, g['coordinates']))
                elif r['layer'] == 'V-NODE-TEXT' and r.get('text'):
                    p = g['coordinates']
                    labels[(round(p[0]), round(p[1]))].append((p, r['text'].strip()))
            for r, p in nodes:
                if not inside(p, REGION_BOX):
                    rejected['fuera de la región'] += 1
                    continue
                key = (round(p[0] + place.dx, 3), round(p[1] + place.dy, 3), round(p[2], 3))
                if key in seen:
                    rejected['duplicado'] += 1
                    continue
                seen.add(key)
                attrs = {}
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for q, text in labels.get((round(p[0]) + dx, round(p[1]) + dy), ()):
                            if math.hypot(q[0] - p[0], q[1] - p[1]) <= 1.0 and (q[2] is None or abs(q[2] - p[2]) < 0.001) and ':' in text:
                                k, v = text.split(':', 1)
                                attrs.setdefault(k.strip().upper(), v.strip())
                z_label = attrs.get('Z')
                matches_label = (abs(float(z_label) - p[2]) < 0.002) if z_label and re.fullmatch(r'-?\d+(\.\d+)?', z_label) else None
                plausible = URBAN_Z[0] <= p[2] <= URBAN_Z[1]
                z_status = ('coincide con rótulo Z y rango 380–600 m' if matches_label and plausible else
                            'en rango 380–600 m sin rótulo coincidente' if plausible else
                            'fuera de rango: Z no utilizable como cota')
                features.append(feature({'type': 'Point', 'coordinates': place.wgs(p)}, {
                    'fuente': src, 'origen': origin, 'bloque': r['space'][6:] if origin != 'modelo' else None,
                    'punto': attrs.get('P'), 'descripcion': attrs.get('D'), 'z': round(p[2], 3),
                    'z_rotulo': z_label, 'z_coincide_rotulo': matches_label, 'cota_estado': z_status,
                    'utm': [round(v, 3) for v in place.utm(p)], 'crs': place.crs_note(p),
                    'nota': 'Punto de levantamiento CAD (V-NODE). Cota sin datum vertical declarado.'}))
    return features, dict(rejected)


# ---------------------------------------------------------------- blocks of land (manzanas)
def ring_contains(ring, x, y):
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def manzanas(place):
    labels = []
    for r in read_jsonl(EXT / f'{TOMAQUE}.dxf.entities.jsonl.gz'):
        if r['layer'] in ('Nº MANZANA', 'nomenclatura Manzana', 'N° MANZ.') and r.get('text') and r.get('geometry'):
            labels.append((r['geometry']['coordinates'], ' '.join(r['text'].split())))
    features, seen = [], set()
    for r in read_jsonl(EXT / f'{TOMAQUE}.dxf.raw.jsonl.gz'):
        a = r['attributes']
        if r['type'] != 'LWPOLYLINE' or a.get('layer') != 'Limite Manzana' or a['handle'] in seen:
            continue
        seen.add(a['handle'])
        ring = [[v[0], v[1]] for v in r['vertices_xyseb']]
        if len(ring) < 3 or not all(inside(p, REGION_BOX) for p in ring):
            continue
        rpu = r.get('xdata', {}).get('RPU_GRAFICOS')
        streets = []
        if rpu:
            raw = ''.join(str(v) for code, v in rpu if code == 1000)
            streets = [s.strip('#').strip() for s in raw.split('#@') if s.strip('#').strip()]
        inside_labels = sorted({t for p, t in labels if ring_contains(ring, p[0], p[1])})
        closed = ring + [ring[0]] if ring[0] != ring[-1] else ring
        features.append(feature({'type': 'Polygon', 'coordinates': [[place.wgs(p) for p in closed]]}, {
            'fuente': TOMAQUE, 'handle': a['handle'], 'calles_colindantes': streets,
            'rotulos_manzana': inside_labels, 'curvas_aproximadas': any(abs(v[4]) > 1e-9 for v in r['vertices_xyseb']),
            'crs': place.crs_note(ring[0]),
            'nota': 'Contorno CAD de manzana con xdata RPU_GRAFICOS; no es un límite catastral validado.'}))
    return features


# ---------------------------------------------------------------- lot labels
def lot_labels(place):
    codes = {}
    for r in read_jsonl(EXT / f'{TOMAQUE}.dxf.raw.jsonl.gz'):
        epod = r.get('xdata', {}).get('EGPT_EPOD')
        if epod:
            codes[r['attributes']['handle']] = ''.join(str(v) for code, v in epod if code == 1000)
    features, seen = [], set()
    kinds = Counter()
    for r in read_jsonl(EXT / f'{TOMAQUE}.dxf.entities.jsonl.gz'):
        if r['layer'] not in ('Nomeclatura Lote', 'N° DE LOTE', 'COTA LOTE') or not r.get('text') or not r.get('geometry'):
            continue
        text = ' '.join(r['text'].split())
        p = r['geometry']['coordinates']
        key = (text, round(p[0] + place.dx, 2), round(p[1] + place.dy, 2))
        if key in seen or not inside(p, REGION_BOX):
            continue
        seen.add(key)
        if re.fullmatch(r'\d{1,3}[A-Z]?(-[A-Z0-9]+)?', text):
            kind = 'numero_lote'
        elif re.fullmatch(r'(\d+(\.\d+)?|\.\d+)\s*(m|ml|m2|m²)?', text, re.I):
            kind = 'medida'
        elif LAND_USE.search(text):
            kind = 'uso'
        elif CLASSES[0][1].search(text):
            kind = 'calle'
        elif re.fullmatch(r'[A-Z]', text):
            kind = 'letra'
        else:
            kind = 'otro'
        kinds[kind] += 1
        features.append(feature({'type': 'Point', 'coordinates': place.wgs(p)}, {
            'texto': text, 'tipo': kind, 'capa': r['layer'], 'codigo_epod': codes.get(r['handle']),
            'crs': place.crs_note(p)}))
    return features, dict(kinds)


# ---------------------------------------------------------------- route sketches in unused blocks
def route_blocks():
    """Find, for each candidate block, the translation that maps it onto model
    geometry. Accept it only when many vertices coincide within 5 cm."""
    model = list(read_jsonl(EXT / f'{REFERENCE}.dxf.entities.jsonl.gz'))
    grid5 = defaultdict(list)
    by_layer = defaultdict(list)
    for r in model:
        g = r.get('geometry')
        if g and g['type'] != 'Point':
            for p in points_of(g):
                if inside(p, REGION_BOX):
                    grid5[(int(p[0] // 5), int(p[1] // 5))].append((p[0], p[1], r['layer']))
                    by_layer[r['layer']].append((p[0], p[1]))
    blocks = defaultdict(list)
    for r in read_jsonl(DEEP / f'{REFERENCE}.unused-blocks.jsonl.gz'):
        if r.get('geometry'):
            blocks[r['space'][6:]].append(r)
    candidates = []
    for name, recs in blocks.items():
        layers = Counter(r['layer'] for r in recs)
        layer, count = layers.most_common(1)[0]
        if count < 50 or not (layer.upper().startswith(('SECT', 'PERIMETRO', 'R')) and len(layer) > 1):
            continue
        candidates.append((name, layer, recs))

    def near(x, y, tol):
        best, bd = None, tol
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in grid5.get((int(x // 5) + dx, int(y // 5) + dy), ()):
                    d = math.hypot(q[0] - x, q[1] - y)
                    if d < bd:
                        bd, best = d, q
        return best, bd

    features, report = [], []
    for name, layer, recs in candidates:
        pts = [p for r in recs if r['geometry']['type'] != 'Point' for p in points_of(r['geometry'])]
        target = by_layer.get(layer) or [p for v in by_layer.values() for p in v]
        sample = pts[::max(1, len(pts) // 150)]
        tgt = target[::max(1, len(target) // 6000)]
        votes = Counter((round(q[0] - p[0]), round(q[1] - p[1])) for p in sample for q in tgt)
        (cx, cy), _ = votes.most_common(1)[0]
        offsets = []
        for p in pts:
            q, _ = near(p[0] + cx, p[1] + cy, 1.5)
            if q:
                offsets.append((q[0] - p[0], q[1] - p[1]))
        if len(offsets) < 20:
            report.append({'bloque': name, 'capa': layer, 'aceptado': False, 'motivo': 'sin coincidencias suficientes'})
            continue
        dx = statistics.median(o[0] for o in offsets)
        dy = statistics.median(o[1] for o in offsets)
        exact = sum(1 for o in offsets if abs(o[0] - dx) < 0.05 and abs(o[1] - dy) < 0.05)
        accepted = exact >= 100
        report.append({'bloque': name, 'capa': layer, 'traslacion_m': [round(dx, 3), round(dy, 3)],
                       'vertices': len(pts), 'coincidencias_5cm': exact, 'aceptado': accepted,
                       'motivo': 'traslación verificada por coincidencias exactas' if accepted else 'menos de 100 coincidencias exactas'})
        if not accepted:
            continue
        place = Placement((dx, dy), f'Bloque no insertado trasladado {dx:.3f} m E, {dy:.3f} m N para coincidir con el CAD EPSG:32717')
        new_lines = present = 0
        for r in recs:
            g = r['geometry']
            moved = [[p[0] + dx, p[1] + dy] for p in points_of(g)]
            if not all(inside(p, CITY_BOX) for p in moved):
                continue
            if g['type'] == 'Point':
                if r['type'] == 'INSERT':
                    features.append(feature({'type': 'Point', 'coordinates': place.wgs(points_of(g)[0])}, {
                        'tipo': 'simbolo', 'bloque_origen': name, 'simbolo': r.get('block'), 'capa': r['layer'],
                        'rotacion_cad_grados': r.get('rotation'), 'crs': place.status,
                        'nota': 'Símbolo de la versión no insertada; la orientación no se calibró contra la leyenda.'}))
                continue
            hits = sum(1 for p in moved if near(p[0], p[1], 0.05)[0])
            close = sum(1 for p in moved if near(p[0], p[1], 3.0)[0])
            status = 'ya presente en el modelo' if hits == len(moved) else (
                'próximo a geometría del modelo (≤3 m)' if close == len(moved) else 'no presente en el modelo')
            if status == 'ya presente en el modelo':
                present += 1
                continue
            new_lines += 1
            features.append(feature({'type': 'LineString', 'coordinates': [place.wgs(p) for p in points_of(g)]}, {
                'tipo': 'trazo', 'bloque_origen': name, 'capa': r['layer'], 'cad_tipo': r['type'], 'color': r.get('color'),
                'comparacion_modelo': status, 'crs': place.status,
                'nota': 'Versión no insertada en el dibujo; servicio y vigencia por confirmar.'}))
        report[-1].update({'trazos_nuevos': new_lines, 'trazos_ya_en_modelo': present})
    return features, report


# ---------------------------------------------------------------- toponyms
def toponyms(placements):
    features, seen = [], set()
    published = Counter()
    for src in DWGS:
        place = placements[src]
        for r in read_jsonl(EXT / f'{src}.dxf.entities.jsonl.gz'):
            text = r.get('text')
            if not text or not r.get('geometry') or r.get('hidden'):
                continue
            text = ' '.join(text.replace('\\P', ' ').split())
            if len(text) < 4:
                continue
            klass = next((k for k, rx in CLASSES if rx.search(text)), None)
            if not klass:
                continue
            p = r['geometry']['coordinates']
            if not inside(place.utm(p), REGION_BOX):
                continue
            key = (klass, text.upper(), round(p[0] + place.dx), round(p[1] + place.dy))
            if key in seen:
                continue
            seen.add(key)
            published[klass] += 1
            features.append(feature({'type': 'Point', 'coordinates': place.wgs(p)}, {
                'clase': klass, 'texto': text, 'capa': r['layer'], 'fuente': src,
                'ya_en_cartografia': src in ROUTE_DWGS and r['layer'] == 'CALLES',
                'crs': place.crs_note(p)}))
    return features, dict(published)


# ---------------------------------------------------------------- dimensions
def dimensions(place):
    features = []
    for r in read_jsonl(DEEP / f'{TOMAQUE}.annotations.jsonl.gz'):
        d = r.get('dimension')
        if not d:
            continue
        anchor = d.get('text_midpoint') or (d['defpoints'][0] if d['defpoints'] else None)
        if not anchor or not inside(anchor, REGION_BOX):
            continue
        angular = d.get('dimtype') in (2, 5)
        features.append(feature({'type': 'Point', 'coordinates': place.wgs(anchor)}, {
            'valor': round(d['measurement'], 4) if isinstance(d.get('measurement'), (int, float)) else None,
            'unidad': 'grados' if angular else 'unidades del dibujo (m)',
            'texto_sustituido': d.get('text_override') or None, 'capa': r['layer'], 'crs': place.crs_note(anchor)}))
    return features


def bak_comparison():
    rows = []
    for dwg in DWGS:
        bak = [p for p in DEEP.glob('*.bak.deep.json') if p.name.split('.bak')[0].split(' (1)')[0] == dwg.removesuffix('.dwg')]
        if not bak:
            rows.append({'dwg': dwg, 'bak': None})
            continue
        a = json.loads((DEEP / f'{dwg}.deep.json').read_text(encoding='utf8'))
        b = json.loads(bak[0].read_text(encoding='utf8'))
        rows.append({'dwg': dwg, 'bak': b['source'],
                     'layouts_iguales': [l['texts'] for l in a['layouts']] == [l['texts'] for l in b['layouts']],
                     'bloques_no_insertados': [len(a['unused_blocks']), len(b['unused_blocks'])],
                     'xrecords': [len(a['xrecords']), len(b['xrecords'])],
                     'grupos': [len(a['groups']), len(b['groups'])],
                     'modelo_registros': [a['model']['records'], b['model']['records']]})
    return rows


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    print('Estimating Tomaque alignment', flush=True)
    alignment = estimate_shift()
    (OUT / 'tomaque-alineacion.json').write_text(json.dumps(alignment, ensure_ascii=False, indent=2), encoding='utf8')
    t = alignment['translation_m']
    tomaque_place = Placement((t['dE'], t['dN']),
                              f"Traslación +{t['dE']} m E, +{t['dN']} m N verificada contra {REFERENCE} (EPSG:32717)")
    placements = {src: Placement() for src in ROUTE_DWGS}
    placements[TOMAQUE] = tomaque_place
    summary = {'tomaque_alineacion': alignment}
    print('Sheets', flush=True)
    summary['hojas'] = write_geojson('hojas-planos.geojson', sheets(placements))
    print('Survey points', flush=True)
    pts, rejected = survey_points(placements)
    summary['puntos_topograficos'] = {'publicados': write_geojson('puntos-topograficos.geojson', pts), 'descartados': rejected,
                                      'cota_estado': Counter(f['properties']['cota_estado'] for f in pts),
                                      'z_utilizable_min': min((f['properties']['z'] for f in pts if f['properties']['cota_estado'].startswith('coincide')), default=None),
                                      'z_utilizable_max': max((f['properties']['z'] for f in pts if f['properties']['cota_estado'].startswith('coincide')), default=None),
                                      'descripciones': Counter(f['properties']['descripcion'] for f in pts).most_common(25)}
    print('Manzanas', flush=True)
    mz = manzanas(tomaque_place)
    summary['manzanas'] = {'publicadas': write_geojson('manzanas.geojson', mz),
                           'con_calles_rpu': sum(1 for f in mz if f['properties']['calles_colindantes']),
                           'con_rotulo': sum(1 for f in mz if f['properties']['rotulos_manzana'])}
    print('Lot labels', flush=True)
    lots, kinds = lot_labels(tomaque_place)
    summary['etiquetas_lote'] = {'publicadas': write_geojson('etiquetas-lote.geojson.gz', lots, compress=True), 'tipos': kinds,
                                 'con_codigo_epod': sum(1 for f in lots if f['properties']['codigo_epod'])}
    print('Route blocks', flush=True)
    rb, report = route_blocks()
    summary['rutas_bloques'] = {'publicados': write_geojson('rutas-bloques.geojson', rb), 'bloques': report}
    print('Toponyms', flush=True)
    top, classes = toponyms(placements)
    summary['toponimia'] = {'publicados': write_geojson('toponimia.geojson', top), 'clases': classes}
    print('Dimensions', flush=True)
    summary['cotas'] = write_geojson('cotas.geojson', dimensions(tomaque_place))
    summary['bak_vs_dwg'] = bak_comparison()
    (OUT / 'resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != 'tiles_1km'}) for k, v in summary.items() if k != 'bak_vs_dwg'}, ensure_ascii=False)[:4000])


if __name__ == '__main__':
    run()
