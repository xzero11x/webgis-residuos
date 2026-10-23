"""Third pass, part 9: geometric pending items, each closed with evidence.

1. ACIS blobs in AcDsPrototype_1b matched to REGION entities by decoded geometry.
2. The 43 Tomaque entities that share handle and raw coordinates with COFOPRI:
   for each, the frame its surroundings support (Tomaque or COFOPRI), from the
   distance to Tomaque's own linework and to the georeferenced parcels of the
   route CAD at both candidate positions. Raw coordinates are never changed.
3. HATCH loops assembled into polygons with holes (outer rings by flag/containment).
4. Paper-space content: georeferenced only with evidence -
   a) content over a viewport: transformed with the viewport and accepted when
      its vertices coincide with model geometry;
   b) location plans drawn in paper space: similarity transform fitted on
      street/sector names matched to model texts, accepted on residuals.

Outputs: data/cad/extracted/tercera/pendientes/geo-*.json and complementos/*.geojson.
"""
from collections import Counter, defaultdict
import gzip
import json
import math
import re
import ezdxf
from ezdxf.acis import api as acis
from ezdxf.path import from_hatch
from pyproj import Transformer
import dwg_native as dn
from sources import ROOT, SOURCE_DIR

EXT = ROOT / 'data/cad/extracted'
T3 = EXT / 'tercera'
OUT = T3 / 'pendientes'
COMP = T3 / 'complementos'
TOMAQUE = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg'
TOM, COF = (3.589, 2.352), (-250.301, -376.509)
PLACEMENT = {'RUTAS CON TIEMPO.dwg': (0.0, 0.0), 'RUTAS bagua.dwg': (0.0, 0.0), 'RUTA ORGANICO.dwg': (0.0, 0.0),
             'RUTA LIMPIO.dwg': (0.0, 0.0), TOMAQUE: TOM, 'COFOPRI BAGUA.dwg': COF}
TO_WGS = Transformer.from_crs(32717, 4326, always_xy=True)


def read_jsonl(path):
    with gzip.open(path, 'rt', encoding='utf8') as s:
        for line in s:
            yield json.loads(line)


def pts_of(g):
    c = g['coordinates']
    return [c] if g['type'] == 'Point' else c[0] if g['type'] == 'Polygon' else c


def wgs(pts, offset):
    return [[round(v, 8) for v in TO_WGS.transform(p[0] + offset[0], p[1] + offset[1])] for p in pts]


def segdist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.dist(p, (a[0] + t * dx, a[1] + t * dy))


class LineIndex:
    def __init__(self, cell=25):
        self.cell = cell
        self.grid = defaultdict(list)

    def add(self, a, b, tag):
        n = max(1, int(math.dist(a, b) // self.cell) + 1)
        for i in range(n + 1):
            x = a[0] + (b[0] - a[0]) * i / n
            y = a[1] + (b[1] - a[1]) * i / n
            self.grid[(int(x // self.cell), int(y // self.cell))].append((a, b, tag))

    def nearest(self, p, reach=4):
        best = (None, None)
        cx, cy = int(p[0] // self.cell), int(p[1] // self.cell)
        for i in range(-reach, reach + 1):
            for j in range(-reach, reach + 1):
                for a, b, tag in self.grid.get((cx + i, cy + j), ()):
                    d = segdist(p, a, b)
                    if best[0] is None or d < best[0]:
                        best = (d, tag)
        return best


# ------------------------------------------------------------------ 1. ACIS blobs
def acis_blobs():
    dwg = dn.DwgFile(SOURCE_DIR / TOMAQUE)
    data = dwg.section('AcDb:AcDsPrototype_1b')
    def loops(bodies):
        return [frozenset(tuple(round(v, 3) for v in c.edge.start_vertex.point.location) for c in loop.coedges())
                for body in bodies for lump in body.lumps() for shell in lump.shells() for face in shell.faces() for loop in face.loops()]
    blobs = []
    for m in re.finditer(rb'(ACIS|ASM) BinaryFile', data):
        start = m.start()
        end = data.find(b'data', data.find(b'End', start)) + 4
        blob = data[start:end]
        strings = dn.ascii_strings(blob, 5)
        blobs.append({'offset': start, 'bytes': len(blob), 'format': m.group(1).decode(),
                      'modeler': next((s for s in strings if re.match(r'(ASM|ACIS) \d', s)), None),
                      'fecha': next((s for s in strings if re.match(r'\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4}', s)), None),
                      'loops': loops(acis.load(blob))})
    doc = ezdxf.readfile(ROOT / 'data/cad/converted' / f'{TOMAQUE}.dxf')
    regions = [(e.dxf.handle, e.dxf.layer, e.dxf.owner, loops(acis.load_dxf(e)))
               for e in doc.entitydb.values() if e.is_alive and e.dxftype() == 'REGION']
    out = []
    for b in blobs:
        match = [h for h, _, _, lp in regions if set(lp) == set(b['loops'])]
        out.append({k: v for k, v in b.items() if k != 'loops'} | {
            'vertices': [len(l) for l in b['loops']], 'region_handles': match})
    by_region = Counter(h for b in out for h in b['region_handles'])
    for b in out:
        if not b['region_handles']:
            b['resultado'] = 'sin entidad: geometría no coincide con ninguna REGION'
        elif any(by_region[h] > 1 for h in b['region_handles']):
            latest = max((x for x in out if x['region_handles'] == b['region_handles']), key=lambda x: x['offset'])
            b['resultado'] = 'datos ACIS vigentes de la REGION' if b is latest else \
                'versión anterior (misma geometría) de la REGION; reemplazada por el bloque ASM posterior'
        else:
            b['resultado'] = 'datos ACIS de la REGION'
    return {'blobs': out, 'regiones_dxf': [{'handle': h, 'layer': l, 'owner': o, 'vertices': [len(x) for x in lp]} for h, l, o, lp in regions]}


# ------------------------------------------------------------------ 2. 43 entities in the COFOPRI frame
def frames_43():
    anomalies = json.loads((T3 / 'versiones' / 'tomaque-cofopri-coordenadas-identicas.json').read_text(encoding='utf8'))
    skip = {a['handle'] for a in anomalies}
    tom = LineIndex()
    for r in read_jsonl(EXT / f'{TOMAQUE}.dxf.entities.jsonl.gz'):
        g = r.get('geometry')
        if g and g['type'] != 'Point' and r.get('handle') not in skip:
            c = pts_of(g)
            for a, b in zip(c, c[1:]):
                tom.add(a[:2], b[:2], r['layer'])
    parcels = LineIndex()
    for r in read_jsonl(EXT / 'RUTAS CON TIEMPO.dwg.dxf.entities.jsonl.gz'):
        g = r.get('geometry')
        if g and g['type'] != 'Point' and r['layer'] == 'parcelas':
            c = pts_of(g)
            for a, b in zip(c, c[1:]):
                parcels.add(a[:2], b[:2], r['layer'])
    delta = (COF[0] - TOM[0], COF[1] - TOM[1])
    # Same-text twins in every source, in EPSG:32717 (the 43 themselves excluded).
    twins = defaultdict(list)
    for src, off in PLACEMENT.items():
        for r in read_jsonl(EXT / f'{src}.dxf.entities.jsonl.gz'):
            g = r.get('geometry')
            if r.get('text') and g and g['type'] == 'Point' and not (src in (TOMAQUE, 'COFOPRI BAGUA.dwg') and r.get('handle') in skip):
                key = re.sub(r'\s+', ' ', r['text'].upper()).strip()
                twins[key].append((src, g['coordinates'][0] + off[0], g['coordinates'][1] + off[1]))
    rows, features = [], []
    for a in anomalies:
        raw = a['utm_bruto']
        cand_b = (raw[0] + delta[0], raw[1] + delta[1])          # COFOPRI frame expressed in Tomaque raw units
        dA, layA = tom.nearest(raw)
        dB, layB = tom.nearest(cand_b)
        utmA = (raw[0] + TOM[0], raw[1] + TOM[1])
        utmB = (raw[0] + COF[0], raw[1] + COF[1])
        pA = parcels.nearest(utmA, reach=8)[0]
        pB = parcels.nearest(utmB, reach=8)[0]
        score = 0
        reasons = []
        if dA is not None and (dB is None or dA * 2 < dB):
            score += 2; reasons.append(f'geometría propia de Tomaque a {dA:.1f} m en su marco' + (f' frente a {dB:.1f} m' if dB is not None else ' y ninguna a 100 m en el de COFOPRI'))
        elif dB is not None and (dA is None or dB * 2 < dA):
            score -= 2; reasons.append(f'geometría de Tomaque a {dB:.1f} m solo en el marco de COFOPRI')
        if pA is not None and (pB is None or pA * 2 < pB):
            score += 1; reasons.append(f'parcelas georreferenciadas a {pA:.1f} m (marco Tomaque) frente a {pB if pB is not None else "—"}')
        elif pB is not None and (pA is None or pB * 2 < pA):
            score -= 1; reasons.append(f'parcelas georreferenciadas a {pB:.1f} m (marco COFOPRI) frente a {pA if pA is not None else "—"}')
        key = re.sub(r'\s+', ' ', (a.get('texto_publico') or '').upper()).strip()
        if key:
            tA = [t for t in twins.get(key, ()) if math.dist(utmA, t[1:]) <= 1.0]
            tB = [t for t in twins.get(key, ()) if math.dist(utmB, t[1:]) <= 1.0]
            if tA and not tB:
                score += 3; reasons.append(f'mismo texto en {tA[0][0]} a ≤1 m de la posición en el marco de Tomaque')
            elif tB and not tA:
                score -= 3; reasons.append(f'mismo texto en {tB[0][0]} a ≤1 m de la posición en el marco de COFOPRI')
        frame = 'Tomaque' if score >= 2 else 'COFOPRI' if score <= -2 else 'indeterminado'
        transform = {'Tomaque': TOM, 'COFOPRI': COF}.get(frame)
        rows.append({'handle': a['handle'], 'type': a['type'], 'layer': a['layer'], 'texto': a.get('texto_publico'),
                     'utm_bruto': raw, 'dist_tomaque_marco_tomaque_m': dA, 'capa_cercana_A': layA,
                     'dist_tomaque_marco_cofopri_m': dB, 'capa_cercana_B': layB,
                     'dist_parcelas_marco_tomaque_m': pA, 'dist_parcelas_marco_cofopri_m': pB,
                     'puntuacion': score, 'marco': frame, 'traslacion_m': transform, 'evidencias': reasons})
        if transform:
            features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': wgs([raw], transform)[0]},
                             'properties': {'source': TOMAQUE, 'handle': a['handle'], 'layer': a['layer'], 'text': a.get('texto_publico'),
                                            'marco': frame, 'traslacion_m': transform, 'utm_bruto': raw,
                                            'dato': 'derivado (marco asignado por evidencia geométrica)',
                                            'interpretacion': 'rótulo de parcela o de plano; sin validar en terreno'}})
    return rows, features


# ------------------------------------------------------------------ 3. hatches with holes
def ring_area(r):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1])) / 2


def inside(p, ring):
    x, y = p
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def self_intersects(ring):
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    segs = list(zip(ring, ring[1:] + ring[:1]))
    n = len(segs)
    if n > 400:
        return None
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            (a, b), (c, d) = segs[i], segs[j]
            if (cross(a, b, c) * cross(a, b, d) < 0) and (cross(c, d, a) * cross(c, d, b) < 0):
                return True
    return False


def hatch_polygons():
    features, stats = [], Counter()
    for source, offset in PLACEMENT.items():
        doc = ezdxf.readfile(ROOT / 'data/cad/converted' / f'{source}.dxf')
        model = doc.modelspace().block_record_handle
        for e in doc.entitydb.values():
            if not e.is_alive or e.dxftype() != 'HATCH' or len(e.paths) < 2 or e.dxf.owner != model:
                continue
            rings = []
            for path, raw in zip(from_hatch(e), e.paths):
                r = [(v.x, v.y) for v in path.flattening(0.2)]
                if len(r) > 3 and r[0] == r[-1]:
                    r = r[:-1]
                if len({(round(x, 4), round(y, 4)) for x, y in r}) >= 3 and abs(ring_area(r)) > 1e-6:
                    rings.append((r, raw.path_type_flags))
                else:
                    stats['anillos_degenerados_descartados'] += 1
            if len(rings) < 2:
                continue
            stats['sombreados_multianillo'] += 1
            # Even-odd rule (AutoCAD 'normal' style): containment depth decides outer/hole.
            areas = [abs(ring_area(r)) for r, _ in rings]
            def probe(r):
                return ((r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2) if len(r) > 1 else r[0]
            parents = []
            for i, (r, _) in enumerate(rings):
                pt = probe(r)
                containers = [j for j in range(len(rings)) if j != i and areas[j] > areas[i] and inside(pt, rings[j][0])]
                parents.append(containers)
            depth = [len(c) for c in parents]
            outers = [i for i in range(len(rings)) if depth[i] % 2 == 0]
            polys = []
            for o in outers:
                holes = [i for i in range(len(rings)) if depth[i] == depth[o] + 1 and o in parents[i]]
                polys.append((o, holes))
            nested = [i for i in range(len(rings)) if depth[i] % 2 == 1 and not any(i in h for _, h in polys)]
            for o, holes in polys:
                outer = rings[o][0]
                if ring_area(outer) < 0:
                    outer = outer[::-1]
                hole_rings = []
                for h in holes:
                    r = rings[h][0]
                    hole_rings.append(r[::-1] if ring_area(r) > 0 else r)
                checks = [self_intersects(outer)] + [self_intersects(h) for h in hole_rings]
                valid = None if None in checks else not any(checks)
                stats['poligonos'] += 1
                stats['con_huecos'] += bool(hole_rings)
                stats['validos' if valid else 'no_validos' if valid is False else 'sin_comprobar'] += 1
                rings_wgs = [wgs(r + [r[0]], offset) for r in [outer] + hole_rings]
                area = abs(ring_area(outer)) - sum(abs(ring_area(h)) for h in hole_rings)
                features.append({'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': rings_wgs},
                                 'properties': {'source': source, 'handle': e.dxf.handle, 'layer': e.dxf.layer,
                                                'pattern': e.dxf.pattern_name, 'solid': bool(e.dxf.solid_fill),
                                                'anillos_totales': len(rings), 'huecos': len(hole_rings),
                                                'anillos_anidados_sin_asignar': len(nested), 'area_neta_m2': round(area, 2),
                                                'valido': valid, 'dato': 'derivado (anillos HATCH ensamblados por contención)',
                                                'interpretacion': 'superficie sombreada; significado según capa, sin validar'}})
    verdicts = postgis_validity([f['geometry'] for f in features])
    if verdicts is not None:
        stats = Counter({k: v for k, v in stats.items() if k not in ('validos', 'no_validos', 'sin_comprobar')})
        for f, (ok, reason) in zip(features, verdicts):
            f['properties']['valido'] = ok
            f['properties']['motivo_invalidez'] = None if ok else reason
            f['properties']['validador'] = 'PostGIS ST_IsValid (transacción de solo lectura)'
            stats['validos_postgis' if ok else 'no_validos_postgis'] += 1
        stats['motivos'] = dict(Counter((f['properties']['motivo_invalidez'] or '').split('[')[0]
                                        for f in features if not f['properties']['valido']))
    return features, dict(stats)


def postgis_validity(geometries):
    """ST_IsValid/ST_IsValidReason for each geometry, in a READ ONLY transaction.
    Returns None when the database is not reachable (then the local check stands)."""
    import subprocess
    rows = ','.join(f"({i},'{json.dumps(g)}')" for i, g in enumerate(geometries))
    sql = ('BEGIN READ ONLY;\nSELECT i, ST_IsValid(x), ST_IsValidReason(x) FROM (SELECT i, '
           'ST_SetSRID(ST_GeomFromGeoJSON(g),4326) x FROM (VALUES ' + rows + ') v(i,g)) q ORDER BY i;\nROLLBACK;\n')
    try:
        res = subprocess.run(['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
                              'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "SET client_min_messages=warning" -f -'],
                             cwd=ROOT, input=sql, capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired):
        return None
    out = {}
    for line in res.stdout.splitlines():
        parts = line.split('|', 2)
        if len(parts) == 3 and parts[0].isdigit():
            out[int(parts[0])] = (parts[1] == 't', parts[2])
    return [out.get(i, (None, 'sin respuesta')) for i in range(len(geometries))] if out else None


# ------------------------------------------------------------------ 4. paper space
STREET = re.compile(r'^(JR|JIRON|AV|AVENIDA|CALLE|CA|PSJE|PASAJE|PROLONG|CARRETERA|MALECON)\b\.?\s*(.+)$', re.I)


def norm_name(t):
    t = re.sub(r'\s+', ' ', (t or '').upper()).strip()
    m = STREET.match(t)
    return m.group(2).strip(' .') if m else None


def similarity(pairs):
    """Least squares x' = a*x - b*y + tx, y' = b*x + a*y + ty."""
    n = len(pairs)
    sx = sum(p[0] for p, _ in pairs) / n
    sy = sum(p[1] for p, _ in pairs) / n
    tx = sum(q[0] for _, q in pairs) / n
    ty = sum(q[1] for _, q in pairs) / n
    num_a = num_b = den = 0.0
    for (x, y), (u, v) in pairs:
        x, y, u, v = x - sx, y - sy, u - tx, v - ty
        num_a += x * u + y * v
        num_b += x * v - y * u
        den += x * x + y * y
    a, b = num_a / den, num_b / den
    return a, b, tx - a * sx + b * sy, ty - b * sx - a * sy


def apply(t, p):
    a, b, tx, ty = t
    return (a * p[0] - b * p[1] + tx, b * p[0] + a * p[1] + ty)


def build_references():
    """Street-name label positions and linework of the georeferenced sources, in EPSG:32717."""
    global street_index, model_lines
    street_index = defaultdict(list)
    model_lines = LineIndex(cell=20)
    for src, off in PLACEMENT.items():
        for r in read_jsonl(EXT / f'{src}.dxf.entities.jsonl.gz'):
            g = r.get('geometry')
            if not g:
                continue
            if r.get('text') and g['type'] == 'Point':
                n = norm_name(r['text'])
                if n:
                    street_index[n].append((g['coordinates'][0] + off[0], g['coordinates'][1] + off[1]))
            elif g['type'] != 'Point' and src in ('RUTAS CON TIEMPO.dwg', TOMAQUE):
                c = pts_of(g)
                for a, b in zip(c, c[1:]):
                    if math.dist(a[:2], b[:2]) > 1:
                        model_lines.add((a[0] + off[0], a[1] + off[1]), (b[0] + off[0], b[1] + off[1]), r['layer'])


def register_by_names(labels, tol=30.0):
    """RANSAC over anchor streets with few model occurrences; inliers against any occurrence."""
    anchors = sorted({n for n, _ in labels}, key=lambda n: len(street_index[n]))[:6]
    anchor_labels = [(n, p) for n, p in labels if n in anchors]
    best = None
    for i in range(len(anchor_labels)):
        for j in range(i + 1, len(anchor_labels)):
            (n1, p1), (n2, p2) = anchor_labels[i], anchor_labels[j]
            if n1 == n2 or math.dist(p1, p2) < 20:
                continue
            for q1 in street_index[n1][:20]:
                for q2 in street_index[n2][:20]:
                    if math.dist(q1, q2) < 50:
                        continue
                    t = similarity([(p1, q1), (p2, q2)])
                    if not 0.5 < math.hypot(t[0], t[1]) < 50:
                        continue
                    inl = []
                    for k, (n, p) in enumerate(labels):
                        tp = apply(t, p)
                        d = min(math.dist(tp, q) for q in street_index[n])
                        if d <= tol:
                            inl.append((k, d))
                    if best is None or len(inl) > len(best[1]):
                        best = (t, inl)
    if not best or len(best[1]) < 4:
        return None
    t, inl = best
    pairs = []
    for k, _ in inl:
        n, p = labels[k]
        tp = apply(t, p)
        pairs.append((p, min(street_index[n], key=lambda q: math.dist(tp, q))))
    t = similarity(pairs)
    res = [math.dist(apply(t, p), q) for p, q in pairs]
    return t, inl, math.sqrt(sum(r * r for r in res) / len(res))


def linework_check(t, group):
    """Independent check: transformed paper linework against model linework."""
    dists = []
    for r in group:
        if r['geometry']['type'] == 'Point':
            continue
        for p in pts_of(r['geometry'])[:50]:
            d = model_lines.nearest(apply(t, p), reach=2)[0]
            dists.append(d if d is not None else 999.0)
    if not dists:
        return {'vertices': 0, 'fraccion_a_5m': 0.0, 'mediana_m': None}
    dists.sort()
    return {'vertices': len(dists), 'fraccion_a_5m': round(sum(d <= 5 for d in dists) / len(dists), 3),
            'mediana_m': round(dists[len(dists) // 2], 2)}


def paper_space():
    build_references()
    results, features = [], []
    for source, offset in PLACEMENT.items():
        deep_path = EXT / 'deep' / f'{source}.deep.json'
        paper_path = EXT / 'deep' / f'{source}.paperspace.jsonl.gz'
        if not deep_path.exists():
            results.append({'source': source, 'resultado': 'sin hojas analizadas en la segunda pasada'})
            continue
        deep = json.loads(deep_path.read_text(encoding='utf8'))
        recs = [r for r in read_jsonl(paper_path) if r.get('geometry') and r['type'] != 'VIEWPORT']
        # model vertices of this source, for the viewport test
        vgrid = set()
        for r in read_jsonl(EXT / f'{source}.dxf.entities.jsonl.gz'):
            g = r.get('geometry')
            if g:
                for p in pts_of(g):
                    vgrid.add((round(p[0] / 0.5), round(p[1] / 0.5)))
        for layout in deep['layouts']:
            lay_recs = [r for r in recs if r['space'] == f"layout:{layout['name']}"]
            used = set()
            # a) content over viewports
            for vp in layout['viewports']:
                if vp.get('id') == 1 or not vp.get('model_window') or not vp.get('paper_per_model_unit'):
                    continue
                cx, cy = vp['paper_center']
                w, h = vp['paper_size']
                s = vp['paper_per_model_unit']
                vcx, vcy = vp['view_center']
                over = [r for r in lay_recs if abs(pts_of(r['geometry'])[0][0] - cx) <= w / 2 and abs(pts_of(r['geometry'])[0][1] - cy) <= h / 2]
                if not over:
                    continue
                tot = hit = 0
                for r in over:
                    for p in pts_of(r['geometry']):
                        mx, my = vcx + (p[0] - cx) / s, vcy + (p[1] - cy) / s
                        tot += 1
                        hit += (round(mx / 0.5), round(my / 0.5)) in vgrid
                frac = hit / tot if tot else 0
                ok = frac >= 0.5 and len(over) >= 5 and abs(vp.get('twist_angle') or 0) % 360 < 1e-3
                results.append({'source': source, 'hoja': layout['name'], 'ventana': vp['id'], 'metodo': 'ventana',
                                'entidades': len(over), 'vertices': tot, 'coinciden_modelo': hit, 'fraccion': round(frac, 3),
                                'resultado': 'georreferenciado por la ventana' if ok else
                                'no alineado: contenido de papel independiente del modelo'})
                if ok:
                    for r in over:
                        used.add(r['ref'])
                        mp = [(vcx + (p[0] - cx) / s, vcy + (p[1] - cy) / s) for p in pts_of(r['geometry'])]
                        features.append(paper_feature(source, layout['name'], r, mp, offset, f"ventana {vp['id']} (exacta)"))
            # b) location plans drawn in paper space: fit paper -> EPSG:32717 on street names.
            rest = [r for r in lay_recs if r['ref'] not in used]
            labelled = [(norm_name(r.get('text')), pts_of(r['geometry'])[0][:2]) for r in rest if r.get('text')]
            labelled = [(n, p) for n, p in labelled if n and n in street_index]
            for ci, members in cluster([p for _, p in labelled], radius=150).items():
                labels = [labelled[i] for i in members]
                if len({n for n, _ in labels}) < 4:
                    continue
                fit = register_by_names(labels)
                xs = [p for _, p in labels]
                pad = 0.35 * max(max(p[0] for p in xs) - min(p[0] for p in xs), max(p[1] for p in xs) - min(p[1] for p in xs))
                box = (min(p[0] for p in xs) - pad, min(p[1] for p in xs) - pad, max(p[0] for p in xs) + pad, max(p[1] for p in xs) + pad)
                group = [r for r in rest if box[0] <= pts_of(r['geometry'])[0][0] <= box[2] and box[1] <= pts_of(r['geometry'])[0][1] <= box[3]]
                row = {'source': source, 'hoja': layout['name'], 'grupo': ci, 'metodo': 'rótulos de calles (semejanza)',
                       'rotulos': len(labels), 'entidades_del_grupo': len(group)}
                if fit is None:
                    results.append(row | {'resultado': 'rechazado: sin ajuste consistente'})
                    continue
                t, inl, rms = fit
                check = linework_check(t, group)
                scale = math.hypot(t[0], t[1])
                ok = len(inl) >= max(8, 0.6 * len(labels)) and rms <= 20 and check['fraccion_a_5m'] >= 0.5
                row |= {'inliers': len(inl), 'rms_rotulos_m': round(rms, 2), 'm_por_unidad_papel': round(scale, 4),
                        'rotacion_grados': round(math.degrees(math.atan2(t[1], t[0])), 3), 'validacion_lineas': check,
                        'resultado': 'georreferenciado por rótulos de calles' if ok else 'rechazado: evidencia insuficiente'}
                results.append(row)
                if ok:
                    for r in group:
                        mp = [apply(t, p) for p in pts_of(r['geometry'])]
                        method = (f"semejanza por {len(inl)} rótulos, RMS {rms:.1f} m, "
                                  f"{check['fraccion_a_5m']:.0%} de vértices a 5 m o menos del modelo")
                        features.append(paper_feature(source, layout['name'], r, mp, (0.0, 0.0), method))
    return results, features


def cluster(points, radius):
    groups, label = {}, [-1] * len(points)
    for i, p in enumerate(points):
        if label[i] >= 0:
            continue
        label[i] = len(groups)
        stack, members = [i], []
        while stack:
            k = stack.pop()
            members.append(k)
            for j, q in enumerate(points):
                if label[j] < 0 and math.dist(points[k], q) <= radius:
                    label[j] = label[i]
                    stack.append(j)
        groups[label[i]] = members
    return groups


def ransac(pairs, tol=20.0):
    best = []
    n = len(pairs)
    for i in range(n):
        for j in range(i + 1, n):
            if math.dist(pairs[i][0], pairs[j][0]) < 1e-6:
                continue
            t = similarity([pairs[i], pairs[j]])
            inl = [k for k in range(n) if math.dist(apply(t, pairs[k][0]), pairs[k][1]) <= tol]
            if len(inl) > len(best):
                best = inl
    t = similarity([pairs[k] for k in best]) if len(best) >= 2 else similarity(pairs)
    return t, best


def paper_feature(source, sheet, r, model_pts, offset, method):
    g = r['geometry']
    coords = wgs(model_pts, offset)
    geom = {'type': 'Point', 'coordinates': coords[0]} if g['type'] == 'Point' else \
        {'type': 'Polygon', 'coordinates': [coords]} if g['type'] == 'Polygon' else {'type': 'LineString', 'coordinates': coords}
    return {'type': 'Feature', 'geometry': geom,
            'properties': {'source': source, 'hoja': sheet, 'ref': r['ref'], 'layer': r['layer'], 'cad_type': r['type'],
                           'text': r.get('text') if r.get('text') and (STREET.match(r['text'].upper()) or len(r['text'].split()) <= 1) else None,
                           'metodo': method, 'dato': 'derivado (georreferenciación de espacio papel)',
                           'interpretacion': 'contenido de plano impreso; precisión limitada a la del método'}}


def write(name, features):
    (COMP / name).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False), encoding='utf8')


def main(parts):
    if 'acis' in parts:
        run_acis()
    if '43' in parts:
        run_43()
    if 'sombreados' in parts:
        run_hatches()
    if 'papel' in parts:
        run_paper()


def run_acis():
    print('ACIS', flush=True)
    ac = acis_blobs()
    (OUT / 'geo-acis.json').write_text(json.dumps(ac, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps([{k: b[k] for k in ('offset', 'format', 'fecha', 'region_handles', 'resultado')} for b in ac['blobs']], ensure_ascii=False), flush=True)


def run_43():
    print('43 entidades', flush=True)
    rows, feats = frames_43()
    (OUT / 'geo-43-marcos.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf8')
    write('tomaque-43-marco-asignado.geojson', feats)
    print(json.dumps(dict(Counter(r['marco'] for r in rows)), ensure_ascii=False), flush=True)


def run_hatches():
    print('Sombreados', flush=True)
    hf, hs = hatch_polygons()
    write('sombreados-con-huecos.geojson', hf)
    (OUT / 'geo-sombreados.json').write_text(json.dumps(hs, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps(hs, ensure_ascii=False), flush=True)


def paper_remaining(features):
    """Classify paper-space content that was not georeferenced, by layout and layer."""
    done = {(f['properties']['source'], f['properties']['hoja'], f['properties']['ref']) for f in features}
    out = []
    for source in PLACEMENT:
        path = EXT / 'deep' / f'{source}.paperspace.jsonl.gz'
        if not path.exists():
            continue
        groups = defaultdict(Counter)
        for r in read_jsonl(path):
            if not r.get('geometry') or r['type'] == 'VIEWPORT':
                continue
            sheet = r['space'].split(':', 1)[1]
            if (source, sheet, r['ref']) in done:
                continue
            layer = r['layer']
            kind = ('flecha de norte (bloque)' if layer.upper() == 'NORTE' else
                    'cajetín, marco o rótulo de hoja' if layer in ('0', 'MARCO', 'TEXTO', 'TEXTOS', 'cuadros', 'RUTAS') else
                    'sección vial o detalle' if 'SECC' in layer.upper() or 'DETALLE' in layer.upper() else
                    'otro contenido de hoja')
            groups[sheet][(kind, layer)] += 1
        for sheet, c in groups.items():
            out.append({'source': source, 'hoja': sheet, 'entidades': sum(c.values()),
                        'clases': [{'clase': k, 'capa': l, 'n': n} for (k, l), n in c.most_common(12)]})
    return out


def run_paper():
    print('Espacio papel', flush=True)
    pr, pf = paper_space()
    rest = paper_remaining(pf)
    (OUT / 'geo-espacio-papel-no-georreferenciado.json').write_text(json.dumps(rest, ensure_ascii=False, indent=1), encoding='utf8')
    write('espacio-papel-georreferenciado.geojson', pf)
    (OUT / 'geo-espacio-papel.json').write_text(json.dumps(pr, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps({'resultados': len(pr), 'georreferenciadas': len(pf),
                      'por_resultado': dict(Counter(r['resultado'] for r in pr))}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    import sys
    parts = set(sys.argv[1:]) or {'acis', '43', 'sombreados', 'papel'}
    OUT.mkdir(parents=True, exist_ok=True)
    COMP.mkdir(parents=True, exist_ok=True)
    main(parts)
