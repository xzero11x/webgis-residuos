"""Nombres de calles documentales de Tomaque para los tramos de Overture sin nombre.

Fuente única de los nombres: `RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg` (extracción de las
pasadas GIS). Overture sigue siendo la única fuente de geometrías: este script NO importa ni
dibuja ninguna línea del DWG; solo usa la posición y la orientación de sus textos de calle como
EVIDENCIA para decidir a qué tramo de Overture corresponde cada nombre.

Reglas (todas verificables en `data/bagua-master/nombres/nombres_dwg.json`):

1. Texto de calle: empieza por Jr./Jirón, Av./Avenida, Calle/Ca., Psje./Pasaje o Malecón y trae
   un nombre. Se excluyen «S/N», descripciones (trocha, camino, carretera) y nombres de sector,
   institución o parcela.
2. Posición: el texto recibe la traslación verificada de Tomaque (+3,589 m E, +2,352 m N sobre
   EPSG:32717). Las entidades de la auditoría con marco no determinable no se usan.
3. Evidencia espacial: un texto respalda a un tramo si su eje (de inicio a fin, estimado por la
   altura y el número de caracteres) queda a ≤ DIST_MAX m del tramo y su orientación difiere
   ≤ ANGULO_MAX° de la del tramo. Si dos tramos paralelos lo cumplen y el segundo no está al
   menos el doble de lejos (o 10 m más lejos), el texto es ambiguo y no respalda a ninguno.
4. Un tramo sin nombre se asigna cuando todos los textos que lo respaldan dan la misma calle
   (mismo tipo y nombre normalizado). Si dan calles distintas, queda ambiguo.
5. Continuidad: un tramo sin textos propios hereda el nombre del tramo contiguo asignado solo si
   se unen por un conector donde únicamente confluyen esos dos tramos (sin cruce), con giro
   ≤ GIRO_MAX°, y el otro extremo no contradice. Se marca aparte: es una inferencia de menor nivel.
6. Calibración: las mismas reglas se aplican a los tramos que YA tienen nombre en Overture y se
   cuenta cuántas veces el nombre documental coincide con el de Overture.

Nada de esto sobrescribe un nombre de Overture. Salida (independiente, solo para rótulos y fichas):
data/bagua-master/nombres/nombres_dwg.json
Uso: .venv-gis/Scripts/python scripts/bagua-master/nombres_dwg.py
"""
import collections
import difflib
import gzip
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path

import duckdb
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'data/cad/extracted'
SOURCE_DWG = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'
ENTITIES = EXT / f'{SOURCE_DWG}.dxf.entities.jsonl.gz'
FRAMES = EXT / 'tercera/pendientes/geo-43-marcos.json'
ALIGNMENT = ROOT / 'data/cad/gis/segunda-pasada/tomaque-alineacion.json'
PARQUET = ROOT / 'data/bagua-master/descarga/2026-09-23.1/transportation_segment.parquet'
OUT = ROOT / 'data/bagua-master/nombres/nombres_dwg.json'

DIST_MAX = 15.0      # m: el eje del texto debe quedar a esta distancia del tramo
ANGULO_MAX = 12.0    # grados de diferencia de orientación
GIRO_MAX = 20.0      # grados de giro máximo en una continuidad
M_LAT = 110_574.0
M_LON = 111_320.0 * math.cos(math.radians(5.64))
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)

PREFIXES = [
    (re.compile(r'^(JR|JIRON|JIRÓN)\b[\s.:]*', re.I), 'Jirón'),
    (re.compile(r'^(AV|AVENIDA)\b[\s.:]*', re.I), 'Avenida'),
    (re.compile(r'^(CALLE|CAL|CA)\b[\s.:]*', re.I), 'Calle'),
    (re.compile(r'^(PSJE|PASAJE|PJE)\b[\s.:]*', re.I), 'Pasaje'),
    (re.compile(r'^(MALECON|MALECÓN)\b[\s.:]*', re.I), 'Malecón'),
]
EXCLUDE = re.compile(
    r'S/N|\bTROCHA|\bCAMINO|\bCARRETERA|\bSECTOR|\bURB\b|\bAA\.?\s?HH|\bI\.?E\.?\b|\bCOLEGIO|\bPARQUE|\bPLAZA|\bMERCADO|'
    r'\bESTADIO|\bLOTIZACI|\bCASER[IÍ]O|\bPARCELA|\bCANAL|\bQUEBRADA|\bRIO\b|\bRÍO\b|\bZONA\b|\bVALLE\b|\bBRUJO\b', re.I)
LOWER = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a'}
ROMAN = re.compile(r'^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$', re.I)


def unaccent(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')


def parse_street(raw):
    """(tipo, nucleo_normalizado, nombre_documental) de un texto de calle, o None."""
    text = ' '.join((raw or '').replace('\\P', ' ').split())
    if not text or EXCLUDE.search(text):
        return None
    for pattern, kind in PREFIXES:
        match = pattern.match(text)
        if match:
            core = text[match.end():].strip(' .:-')
            if len(core) < 3 or re.fullmatch(r'[\d\s./-]+', core) and len(core) < 2:
                return None
            key = re.sub(r'[^A-Z0-9Ñ ]', '', unaccent(core.upper().replace('Ñ', 'Ñ')).replace('Ñ', 'N'))
            key = ' '.join(key.split())
            return kind, key, text
    return None


def display_name(kind, core_raw):
    """Formato de rótulo como los nombres de Overture: «Jirón Las Dalias»."""
    words = []
    for i, w in enumerate(' '.join(core_raw.split()).split(' ')):
        low = w.lower()
        if ROMAN.match(w):
            words.append(w.upper())
        elif i > 0 and low in LOWER:
            words.append(low)
        else:
            words.append(low[:1].upper() + low[1:])
    return f'{kind} ' + ' '.join(words)


def core_of(raw, kind):
    text = ' '.join((raw or '').replace('\\P', ' ').split())
    for pattern, k in PREFIXES:
        if k == kind:
            match = pattern.match(text)
            if match:
                return text[match.end():].strip(' .:-')
    return text


def overture_key(name):
    """(tipo, núcleo normalizado) de un nombre de Overture, para comparar con el documental."""
    parsed = parse_street(name)
    if parsed:
        return parsed[0], parsed[1]
    return None


def metres(lon, lat):
    return lon * M_LON, lat * M_LAT


def text_axis(attrs, text, offset):
    """Eje del texto en EPSG:32717 trasladado: (x0, y0, x1, y1, orientación 0–180) o None."""
    height = attrs.get('height') or attrs.get('char_height') or 1.0
    width_factor = attrs.get('width') if attrs.get('rotation') is not None and attrs.get('width') else 1.0
    if attrs.get('rotation') is not None:
        angle = math.radians(attrs['rotation'])
        dx, dy = math.cos(angle), math.sin(angle)
    elif attrs.get('text_direction'):
        dx, dy = attrs['text_direction'][:2]
        norm = math.hypot(dx, dy) or 1.0
        dx, dy = dx / norm, dy / norm
    else:
        return None
    length = len(text) * height * 0.62 * (width_factor if attrs.get('rotation') is not None else 1.0)
    halign = attrs.get('halign')
    if attrs.get('rotation') is not None and halign in (1, 4) and attrs.get('align_point'):
        cx, cy = attrs['align_point'][:2]
        x0, y0, x1, y1 = cx - dx * length / 2, cy - dy * length / 2, cx + dx * length / 2, cy + dy * length / 2
    elif attrs.get('rotation') is not None and halign in (3, 5) and attrs.get('align_point'):
        x0, y0 = attrs['insert'][:2]
        x1, y1 = attrs['align_point'][:2]
    elif attrs.get('rotation') is not None and halign == 2 and attrs.get('align_point'):
        x1, y1 = attrs['align_point'][:2]
        x0, y0 = x1 - dx * length, y1 - dy * length
    else:
        x0, y0 = attrs['insert'][:2]
        x1, y1 = x0 + dx * length, y0 + dy * length
    x0, x1 = x0 + offset[0], x1 + offset[0]
    y0, y1 = y0 + offset[1], y1 + offset[1]
    return x0, y0, x1, y1, math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180


def candidates():
    alignment = json.loads(ALIGNMENT.read_text(encoding='utf8'))['translation_m']
    offset = (alignment['dE'], alignment['dN'])
    frames = {r['handle']: r['marco'] for r in json.loads(FRAMES.read_text(encoding='utf8'))} if FRAMES.exists() else {}
    stats = collections.Counter()
    out = []
    with gzip.open(ENTITIES, 'rt', encoding='utf8') as stream:
        for line in stream:
            r = json.loads(line)
            if not r.get('text') or r.get('hidden') or not r.get('geometry'):
                continue
            street = parse_street(r['text'])
            if not street:
                if re.match(r'^\s*(JR|JIRON|AV|AVENIDA|CALLE|CA|PSJE|PASAJE)\b', r['text'].strip(), re.I):
                    stats['descartado_no_calle'] += 1
                continue
            if r.get('handle') in frames and frames[r['handle']] != 'Tomaque':
                stats['descartado_marco_no_determinable'] += 1
                continue
            axis = text_axis(r['attributes'], ' '.join(r['text'].split()), offset)
            if not axis:
                stats['descartado_sin_orientacion'] += 1
                continue
            x0, y0, x1, y1, bearing = axis
            if not (760000 < x0 < 800000 and 9360000 < y0 < 9395000):
                stats['descartado_fuera_de_region'] += 1
                continue
            lon0, lat0 = TO_WGS.transform(x0, y0)
            lon1, lat1 = TO_WGS.transform(x1, y1)
            kind, key, original = street
            out.append({
                'handle': r.get('handle'), 'ref': r['ref'], 'capa': r['layer'], 'tipo_cad': r['type'],
                'texto_documental': original, 'tipo': kind, 'clave': key,
                'nombre': display_name(kind, core_of(original, kind)),
                'eje_wgs84': [[lon0, lat0], [lon1, lat1]], 'orientacion_grados': round(bearing, 2),
            })
            stats['candidato'] += 1
    return out, dict(stats), {'traslacion_m': alignment, 'entidades_sha256': hashlib.sha256(ENTITIES.read_bytes()).hexdigest()}


def load_segments():
    con = duckdb.connect()
    con.execute('INSTALL spatial; LOAD spatial;')
    rows = con.execute(
        f"""SELECT id, class, names.primary, [c.connector_id for c in connectors], ST_AsGeoJSON(geometry)
            FROM read_parquet('{PARQUET.as_posix()}') ORDER BY id"""
    ).fetchall()
    segs = []
    for sid, clase, nombre, conns, geojson in rows:
        g = shape(json.loads(geojson))
        m = LineString([metres(x, y) for x, y in g.coords])
        segs.append({'id': sid, 'clase': clase, 'nombre': nombre, 'conectores': conns or [], 'm': m, 'wgs': g})
    return segs


def orientation_at(line, point):
    """Orientación (0–180°) del tramo de `line` más próximo a `point`."""
    d = line.project(point)
    a = line.interpolate(max(d - 1.0, 0))
    b = line.interpolate(min(d + 1.0, line.length))
    return math.degrees(math.atan2(b.y - a.y, b.x - a.x)) % 180


def angle_diff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def evidence(texts, segs, dist_max=DIST_MAX, angle_max=ANGULO_MAX):
    """Para cada texto, el tramo de Overture que respalda (o la razón por la que no)."""
    tree = STRtree([s['m'] for s in segs])
    result = []
    for t in texts:
        (lon0, lat0), (lon1, lat1) = t['eje_wgs84']
        x0, y0 = metres(lon0, lat0)
        x1, y1 = metres(lon1, lat1)
        axis = LineString([(x0, y0), (x1, y1)]) if (x0, y0) != (x1, y1) else None
        if axis is None:
            result.append((t, None, 'sin_eje'))
            continue
        mid = Point((x0 + x1) / 2, (y0 + y1) / 2)
        angle = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        cand = []
        for i in tree.query(mid.buffer(dist_max * 2)):
            seg = segs[i]
            # El eje del texto debe estar a lo largo del tramo: sus dos extremos y su centro cerca.
            d_mid = seg['m'].distance(mid)
            d_ends = max(seg['m'].distance(Point(x0, y0)), seg['m'].distance(Point(x1, y1)))
            if d_mid <= dist_max * 1.6 and d_ends <= dist_max * 2.0:
                diff = angle_diff(angle, orientation_at(seg['m'], mid))
                if diff <= angle_max:
                    cand.append((d_mid, diff, i))
        cand.sort()
        if not cand:
            result.append((t, None, 'sin_tramo_alineado'))
            continue
        d1, diff1, i1 = cand[0]
        if d1 > dist_max:
            result.append((t, None, 'lejos'))
            continue
        if len(cand) > 1:
            d2 = cand[1][0]
            if not (d1 * 2 <= d2 or d2 - d1 >= 10):
                result.append((t, None, 'ambiguo_entre_paralelos'))
                continue
        result.append((t, (segs[i1], round(d1, 1), round(diff1, 1)), 'respalda'))
    return result


RPU = EXT / 'tercera/complementos/rpu.geojson'


def rpu_support(resolved, by_id):
    """Relación documentada: calles colindantes por lado (xdata RPU_GRAFICOS) de lotes y manzanas del DWG.

    Solo respalda: la lista del DWG puede estar incompleta, así que su ausencia no descarta un nombre.
    Estados: «respaldado» (algún lote o manzana a ≤ 25 m cita esa calle), «no_confirmado» (hay lotes o
    manzanas con la lista pero ninguna cita esa calle), «sin_cobertura» (no hay ninguno cerca).
    """
    features = []
    if RPU.exists():
        for f in json.loads(RPU.read_text(encoding='utf8'))['features']:
            if f['geometry'] and f['properties']['source'] == SOURCE_DWG:
                g = shape(f['geometry'])
                coords = g.exterior.coords if g.geom_type == 'Polygon' else g.coords
                names = [t for side in f['properties']['calles_por_lado'] for t in side.split('#') if t.strip()]
                features.append((LineString([metres(x, y) for x, y in coords]), names))
    tree = STRtree([g for g, _ in features]) if features else None
    states = collections.Counter()
    for sid, info in resolved.items():
        near = []
        if tree is not None:
            m = by_id[sid]['m']
            near = [features[i][1] for i in tree.query(m.buffer(25)) if features[i][0].distance(m) <= 25]
        cited = [x for names in near for x in names]
        if not cited:
            state = 'sin_cobertura'
        else:
            keys = [(parse_street(x) or ('', ' '.join(x.upper().split())))[1] for x in cited]
            state = 'respaldado' if any(similar(info['clave'], k) for k in keys) else 'no_confirmado'
        info['rpu'] = state
        states[state] += 1
    return dict(states)


def similar(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.9


def core_overture(name):
    parsed = parse_street(name)
    if parsed:
        return parsed[1]
    return ' '.join(''.join(c for c in unaccent(name.upper()) if c.isalnum() or c == ' ').split())


def group_votes(items):
    """Agrupa los textos de un tramo por calle (núcleo del nombre, tolerando erratas >= 0,9).

    Cada grupo es una calle distinta; si hay más de uno, el tramo es ambiguo.
    """
    groups = []
    for t, d, a in items:
        for g in groups:
            if similar(g['clave'], t['clave']):
                g['items'].append((t, d, a))
                break
        else:
            groups.append({'clave': t['clave'], 'items': [(t, d, a)]})
    return groups


def chosen_name(group):
    """Nombre del grupo: la grafía más repetida; si empatan dos grafías, no se elige."""
    spellings = collections.Counter((t['tipo'], t['nombre']) for t, _, _ in group['items'])
    top = spellings.most_common()
    if len(top) > 1 and top[0][1] == top[1][1]:
        return None
    return top[0][0]


def main():
    texts, stats, provenance = candidates()
    segs = load_segments()
    by_id = {s['id']: s for s in segs}
    ev = evidence(texts, segs)
    reasons = collections.Counter(why for _, _, why in ev)

    # 1. Calibración con los tramos que YA tienen nombre en Overture.
    calib = collections.Counter()
    calib_pairs = []
    tree_all = STRtree([s['m'] for s in segs])
    for t, hit, why in ev:
        if why != 'respalda' or not hit[0]['nombre']:
            continue
        seg = hit[0]
        agrees = similar(core_overture(seg['nombre']), t['clave'])
        lon, lat = t['eje_wgs84'][0]
        mid = Point(metres(lon, lat))
        if agrees:
            calib['coincide'] += 1
        else:
            neighbour = any(
                segs[i]['nombre'] and segs[i]['m'].distance(mid) <= 60
                and similar(core_overture(segs[i]['nombre']), t['clave'])
                for i in tree_all.query(mid.buffer(60)))
            calib['error_espacial_el_vecino_tiene_el_nombre' if neighbour else 'discrepancia_de_nombre'] += 1
        calib_pairs.append((mid, agrees))
    pair_tree = STRtree([m for m, _ in calib_pairs])

    def local_agreement(point, radius=250.0):
        near = [calib_pairs[i][1] for i in pair_tree.query(point.buffer(radius))
                if calib_pairs[i][0].distance(point) <= radius]
        return (sum(near) / len(near) if near else None), len(near)

    # 2. Tramos sin nombre: votos de los textos que los respaldan.
    votes = collections.defaultdict(list)
    for t, hit, why in ev:
        if why == 'respalda' and not hit[0]['nombre']:
            votes[hit[0]['id']].append((t, hit[1], hit[2]))
    assigned, ambiguous, held = {}, {}, {}
    for sid, items in votes.items():
        seg = by_id[sid]
        groups = group_votes(items)
        centre = seg['m'].interpolate(0.5, normalized=True)
        agreement, pairs = local_agreement(centre)
        if len(groups) > 1:
            ambiguous[sid] = {'motivo': 'textos de calles distintas respaldan el mismo tramo',
                              'candidatos': {g['items'][0][0]['nombre']: len(g['items']) for g in groups},
                              'textos': [t['texto_documental'] for t, _, _ in items[:8]]}
            continue
        group = groups[0]
        name = chosen_name(group)
        if name is None:
            ambiguous[sid] = {'motivo': 'dos grafías empatan entre los textos',
                              'candidatos': dict(collections.Counter(t['nombre'] for t, _, _ in group['items'])),
                              'textos': [t['texto_documental'] for t, _, _ in group['items'][:8]]}
            continue
        if pairs >= 4 and agreement is not None and agreement < 0.6:
            held[sid] = {'nombre_documental': name[1], 'motivo': 'zona donde el DWG discrepa de los nombres de Overture',
                         'concordancia_local': round(agreement, 2), 'pares_locales': pairs}
            continue
        its = group['items']
        best = min(its, key=lambda x: x[1])
        assigned[sid] = {
            'nombre': name[1], 'tipo': name[0], 'clave': group['clave'], 'textos': len(its),
            'texto_documental': collections.Counter(t['texto_documental'] for t, _, _ in its).most_common(1)[0][0],
            'distancia_min_m': best[1], 'diferencia_angulo_max': max(x[2] for x in its), 'nivel': 'texto',
            'concordancia_local': None if agreement is None else round(agreement, 2), 'pares_locales': pairs,
            'evidencia': [{'handle': t['handle'], 'capa': t['capa'], 'texto': t['texto_documental'],
                           'distancia_m': d, 'angulo': a} for t, d, a in its[:8]],
        }

    # Relación documentada: si lotes o manzanas cercanos citan calles colindantes y ninguna es esta,
    # el DWG no confirma la correspondencia y el nombre se retiene sin asignar.
    rpu_states = rpu_support(assigned, by_id)
    for sid in [k for k, v in assigned.items() if v['rpu'] == 'no_confirmado']:
        held[sid] = {'nombre_documental': assigned[sid]['nombre'],
                     'motivo': 'lotes o manzanas cercanos citan otras calles colindantes y no esta',
                     'concordancia_local': assigned[sid]['concordancia_local']}
        del assigned[sid]
        rpu_states['no_confirmado'] -= 1

    # 3. Continuidad vial: un tramo sin textos propios entre dos prolongaciones rectas que llevan el
    #    MISMO nombre documental (regla de puente: solo si ambos lados coinciden).
    at = collections.defaultdict(list)
    for s in segs:
        if s['conectores']:
            for c in {s['conectores'][0], s['conectores'][-1]}:
                at[c].append(s['id'])

    def end_direction(line, end):
        pts = list(line.coords)
        a, b = (pts[0], pts[1]) if end == 0 else (pts[-1], pts[-2])
        return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))

    def straight_partner(seg, end):
        connector = seg['conectores'][0] if end == 0 else seg['conectores'][-1]
        best = None
        for oid in at[connector]:
            if oid == seg['id']:
                continue
            other = by_id[oid]
            other_end = 0 if other['conectores'][0] == connector else 1
            # Prolongación recta: las direcciones de salida son opuestas (difieren ~180°).
            delta = abs(end_direction(seg['m'], end) - end_direction(other['m'], other_end)) % 360
            turn = abs(180 - min(delta, 360 - delta))
            if turn <= GIRO_MAX and (best is None or turn < best[1]):
                best = (oid, turn)
        return best

    bridged = {}
    for s in segs:
        if s['nombre'] or s['id'] in assigned or s['id'] in ambiguous or s['id'] in held or len(s['conectores']) < 2:
            continue
        a, b = straight_partner(s, 0), straight_partner(s, 1)
        if not a or not b or a[0] == b[0]:
            continue
        na, nb = assigned.get(a[0]), assigned.get(b[0])
        if na and nb and similar(na['clave'], nb['clave']) and na['nombre'] == nb['nombre']:
            bridged[s['id']] = {'nombre': na['nombre'], 'tipo': na['tipo'], 'clave': na['clave'], 'textos': 0,
                                'texto_documental': na['texto_documental'],
                                'nivel': 'continuidad', 'vecinos': [a[0], b[0]], 'giro_max': max(a[1], b[1])}

    unnamed = [s for s in segs if not s['nombre']]
    resolved = {**assigned, **bridged}
    for state, n in rpu_support(bridged, by_id).items():
        rpu_states[state] = rpu_states.get(state, 0) + n
    unresolved = [s['id'] for s in unnamed
                  if s['id'] not in resolved and s['id'] not in ambiguous and s['id'] not in held]
    zones = json.loads((ROOT / 'data/bagua-master/nombres/zonas.json').read_text(encoding='utf8'))['zona_por_id']
    by_zone = collections.defaultdict(collections.Counter)
    for s in unnamed:
        z = zones.get(s['id'], '?')
        sid = s['id']
        by_zone[z]['sin_nombre_overture'] += 1
        state = ('recuperado_texto' if sid in assigned else 'recuperado_continuidad' if sid in bridged else
                 'ambiguo' if sid in ambiguous else 'retenido_discrepancia' if sid in held else 'sin_correspondencia')
        by_zone[z][state] += 1
    used = {(r['tipo'], r['nombre']) for r in resolved.values()}
    result = {
        'fuente': SOURCE_DWG, 'procedencia': provenance, 'version_overture': '2026-09-23.1',
        'aviso': 'Nombres documentales del DWG (planos de 2014–2018): no se declaran oficiales ni vigentes.',
        'parametros': {'dist_max_m': DIST_MAX, 'angulo_max_grados': ANGULO_MAX, 'giro_max_grados': GIRO_MAX},
        'textos': {'estadisticas': stats, 'candidatos': len(texts),
                   'nombres_distintos_texto': len({(t['tipo'], t['clave']) for t in texts}),
                   'respaldo_por_texto': dict(reasons)},
        'calibracion_tramos_con_nombre_overture': dict(calib),
        'tramos_sin_nombre_overture': len(unnamed),
        'recuperados_por_texto': len(assigned), 'recuperados_por_continuidad': len(bridged),
        'ambiguos': len(ambiguous), 'retenidos_por_discrepancia_local': len(held),
        'sin_correspondencia': len(unresolved), 'nombres_recuperados_distintos': len(used),
        'respaldo_rpu': rpu_states,
        'por_zona': {z: dict(c) for z, c in sorted(by_zone.items(), key=lambda kv: -kv[1]['sin_nombre_overture'])},
        'asociaciones': resolved, 'ambiguos_detalle': ambiguous, 'retenidos_detalle': held,
        'sin_correspondencia_ids': unresolved,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf8')
    summary = {k: v for k, v in result.items()
               if k not in ('asociaciones', 'ambiguos_detalle', 'retenidos_detalle', 'sin_correspondencia_ids')}
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
