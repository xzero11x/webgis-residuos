"""Ajuste de coherencia interna: red vial, huellas complementarias y rutas DWG.

Parte de `diagnostico_coherencia.py` (data/bagua-master/coherencia/diagnostico.json). Nada se
pierde: los originales se copian una vez a `intermedio/original/`, `rutas/original/` y
`complemento/original/`, y cada corrida vuelve a partir de ellos (idempotente).

1. Red vial y capas trazadas sobre la misma imagen (usos del suelo, agua, conectores, rótulos):
   traslación única medida contra las huellas de Overture (desfase sistemático de la imagen de
   trazado). No cambia identificadores ni atributos.
2. Huellas complementarias: las que están ≥ 60 % dentro de un parque, plaza o cancha se retiran;
   con las calles ya trasladadas, las que ocupan ≥ 40 % de calzada se
   retiran (una edificación en medio de la vía es incoherente); las demás que invaden se recortan
   contra la calzada. Overture solo se recorta en la capa de teselas (`intermedio/edificios`): la
   base, sus identificadores, alturas y vínculos no cambian. Las que están ≥ 60 % dentro de un
   parque, plaza o cancha se publican en `coherencia/ocultos_automaticos.json` y el mapa las oculta.
3. Rutas DWG: traslación propia de cada ruta y después ajuste a la red vial («map matching» con
   continuidad: preferencia por la misma vía y su dirección, y conexión por la red entre tramos).
   El trazo DWG original se conserva en `geometria_dwg`; flechas y marcadores se reubican sobre
   el trazo ajustado conservando su sentido.

Salidas: intermedio/*.geojsonl (ajustadas), complemento/edificios_complemento.geojsonl,
rutas/rutas.json y coherencia/ajuste.json (cifras antes/después).

  .venv-gis/Scripts/python scripts/bagua-master/ajustar_coherencia.py
"""
import hashlib
import heapq
import json
import math
import shutil
from pathlib import Path

import numpy as np
import shapely
import shapely.affinity
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, Point, mapping, shape

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/bagua-master'
TO_UTM = Transformer.from_crs(4326, 32717, always_xy=True)
TO_GEO = Transformer.from_crs(32717, 4326, always_xy=True)

CAPAS_TRASLADADAS = ['red_vial', 'calles_rotulo', 'conectores', 'usos_suelo', 'agua']
SEMIANCHO = {
    'motorway': 4.5, 'trunk': 4.5, 'primary': 4.5,
    'secondary': 3.75, 'tertiary': 3.75,
    'residential': 3.0, 'unclassified': 3.0, 'unknown': 3.0, 'living_street': 3.0,
    'service': 2.0,
}
INVASION_RETIRO = 0.40
AREA_MIN = 15.0
MUESTRA_RUTA = 5.0
BUSQUEDA_RUTA = 25.0


def utm(geom):
    return shapely.transform(geom, lambda xy: np.column_stack(TO_UTM.transform(xy[:, 0], xy[:, 1])))


def geo(geom):
    return shapely.set_precision(
        shapely.transform(geom, lambda xy: np.column_stack(TO_GEO.transform(xy[:, 0], xy[:, 1]))), 1e-7)


def read_lines(path):
    with path.open(encoding='utf8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def write_lines(path, features):
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf8', newline='\n') as stream:
        for f in features:
            stream.write(json.dumps(f, ensure_ascii=False) + '\n')
    tmp.replace(path)
    mark_adjusted(path)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def keep_original(path, folder):
    """Devuelve el original del que parte el ajuste.

    Se copia a `folder` la primera vez y cada vez que el archivo vigente ya no es la última salida
    de este script (p. ej. tras volver a correr la fusión o la exportación de rutas): así el ajuste
    nunca se aplica dos veces ni parte de un original viejo.
    """
    folder.mkdir(exist_ok=True)
    original = folder / path.name
    marks_path = folder / '.ajustado.json'
    marks = json.loads(marks_path.read_text(encoding='utf8')) if marks_path.exists() else {}
    if not original.exists() or marks.get(path.name) != sha256(path):
        shutil.copy2(path, original)
    return original


def mark_adjusted(path):
    marks_path = path.parent / 'original' / '.ajustado.json'
    marks_path.parent.mkdir(exist_ok=True)
    marks = json.loads(marks_path.read_text(encoding='utf8')) if marks_path.exists() else {}
    marks[path.name] = sha256(path)
    marks_path.write_text(json.dumps(marks, indent=2), encoding='utf8')


# ---------------------------------------------------------------- 1. red vial
def shift_layers(dx, dy):
    src = DATA / 'intermedio'
    roads = []
    for name in CAPAS_TRASLADADAS:
        path = src / f'{name}.geojsonl'
        if not path.exists():
            continue
        original = keep_original(path, src / 'original')
        out = []
        for f in read_lines(original):
            g = shapely.affinity.translate(utm(shape(f['geometry'])), dx, dy)
            f['geometry'] = mapping(geo(g))
            out.append(f)
            if name == 'red_vial' and f['properties'].get('clase') in SEMIANCHO and g.geom_type == 'LineString':
                roads.append((f['properties']['id'], f['properties']['clase'], g))
        write_lines(path, out)
        print(f'  {name}: {len(out)} elementos trasladados', flush=True)
    return roads


DOBLE_CLASES = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary'}
DOBLE_SEPARACION = (6.0, 18.0)  # metros entre ejes de las dos calzadas
DOBLE_PARALELO = 0.95  # |coseno| mínimo entre direcciones
DOBLE_FRACCION = 0.6  # parte del tramo que debe tener su par


def mark_dual_carriageways():
    """Marca los tramos de avenidas de doble calzada (dos ejes paralelos con berma central).

    Overture/OSM dibujan cada sentido como una línea propia. El mapa necesita saber la separación
    para dibujar cada calzada más estrecha que ella y que la berma se vea siempre. Añade
    `doble_calzada: 1` y `separacion_m` (mediana entre ejes); no cambia la geometría.
    """
    path = DATA / 'intermedio/red_vial.geojsonl'
    feats = read_lines(path)
    idx = [i for i, f in enumerate(feats) if f['properties'].get('clase') in DOBLE_CLASES
           and f['geometry']['type'] == 'LineString']
    geoms = [utm(shape(feats[i]['geometry'])) for i in idx]
    tree = STRtree(np.asarray(geoms, dtype=object))
    marked = 0
    for k, g in enumerate(geoms):
        name = feats[idx[k]]['properties'].get('nombre')
        n = max(int(g.length / 5), 2)
        hits, dists = 0, []
        for t in np.linspace(0.05, 0.95, n):
            p = g.interpolate(t, normalized=True)
            a, b = g.interpolate(max(t - 0.02, 0), normalized=True), g.interpolate(min(t + 0.02, 1), normalized=True)
            u = np.array([b.x - a.x, b.y - a.y])
            if not np.linalg.norm(u):
                continue
            u /= np.linalg.norm(u)
            best = None
            for j in tree.query(p.buffer(DOBLE_SEPARACION[1]), predicate='intersects'):
                if j == k:
                    continue
                other = feats[idx[j]]['properties'].get('nombre')
                if name and other and other != name:
                    continue
                h = geoms[j]
                d = h.distance(p)
                if not DOBLE_SEPARACION[0] <= d <= DOBLE_SEPARACION[1]:
                    continue
                s = h.project(p)
                c, e = h.interpolate(max(s - 2, 0)), h.interpolate(min(s + 2, h.length))
                v = np.array([e.x - c.x, e.y - c.y])
                if not np.linalg.norm(v) or abs(u @ v) / np.linalg.norm(v) < DOBLE_PARALELO:
                    continue
                best = d if best is None else min(best, d)
            if best is not None:
                hits += 1
                dists.append(best)
        if hits >= DOBLE_FRACCION * n:
            props = feats[idx[k]]['properties']
            props['doble_calzada'] = 1
            props['separacion_m'] = round(float(np.median(dists)), 1)
            marked += 1
    write_lines(path, feats)
    return marked


# ---------------------------------------------------------------- 2. huellas complementarias
def corridors(roads):
    geoms = np.asarray([g.buffer(SEMIANCHO[c], cap_style='flat') for _, c, g in roads], dtype=object)
    return geoms, STRtree(geoms)


def invasion_of(geom, corr, tree):
    hits = tree.query(geom, predicate='intersects')
    if not len(hits):
        return 0.0, None
    zone = shapely.union_all(corr[hits])
    return shapely.area(shapely.intersection(geom, zone)) / geom.area, zone


SUAVIZADO_M = 0.5


def soften(geom):
    """Forma cartográfica más amable: sin dientes, espigas ni muescas de menos de ~1 m (salida
    típica de la detección automática) y con las esquinas exteriores levemente redondeadas.

    Apertura (quita salientes finos y redondea esquinas convexas), cierre (rellena muescas) y una
    simplificación de 0,15 m. Si la forma cambiara demasiado (< 85 % o > 110 % de la superficie),
    se conserva la original.
    """
    out = geom.buffer(-SUAVIZADO_M, join_style='mitre').buffer(SUAVIZADO_M, join_style='round', quad_segs=2)
    out = out.buffer(0.4, join_style='mitre').buffer(-0.4, join_style='mitre')
    out = shapely.make_valid(out.simplify(0.15))
    polys = [g for g in getattr(out, 'geoms', [out]) if g.geom_type == 'Polygon']
    if not polys:
        return geom
    best = max(polys, key=lambda g: g.area)
    if not 0.85 * geom.area <= best.area <= 1.10 * geom.area:
        return geom
    return best


def adjust_complement(corr, tree, spaces, spaces_tree):
    path = DATA / 'complemento/edificios_complemento.geojsonl'
    original = keep_original(path, DATA / 'complemento/original')
    kept, stats = [], {'leidas': 0, 'sin_invasion': 0, 'recortadas': 0, 'retiradas_en_calzada': 0,
                       'retiradas_por_recorte': 0, 'retiradas_en_parque': 0}
    by_source = {}
    for f in read_lines(original):
        stats['leidas'] += 1
        g = utm(shape(f['geometry']))
        src = f['properties']['fuente']
        if in_open_space(g, spaces, spaces_tree) >= DENTRO_ESPACIO_ABIERTO:
            stats['retiradas_en_parque'] += 1
            by_source[src] = by_source.get(src, 0) + 1
            continue
        frac, zone = invasion_of(g, corr, tree)
        if frac < 0.01:
            stats['sin_invasion'] += 1
            kept.append(f)
            continue
        if frac >= INVASION_RETIRO:
            stats['retiradas_en_calzada'] += 1
            by_source[src] = by_source.get(src, 0) + 1
            continue
        cut = shapely.make_valid(g.difference(zone))
        polys = [p for p in getattr(cut, 'geoms', [cut]) if p.geom_type == 'Polygon']
        best = max(polys, key=lambda p: p.area) if polys else None
        if best is None or best.area < AREA_MIN or best.area < 0.5 * g.area:
            stats['retiradas_por_recorte'] += 1
            by_source[src] = by_source.get(src, 0) + 1
            continue
        best = best.simplify(0.1)
        f['geometry'] = mapping(geo(best))
        f['properties']['area_m2'] = round(float(best.area), 1)
        f['properties']['recorte'] = 'calzada'  # se guarda en `atributos` al importar
        stats['recortadas'] += 1
        kept.append(f)
    for f in kept:
        g = soften(utm(shape(f['geometry'])))
        f['geometry'] = mapping(geo(g))
    write_lines(path, kept)
    stats['conservadas'] = len(kept)
    stats['retiradas_por_fuente'] = by_source
    return stats


ESPACIOS_ABIERTOS = {'park', 'pitch', 'stadium', 'grass', 'garden', 'recreation_ground'}
DENTRO_ESPACIO_ABIERTO = 0.60


def open_spaces():
    """Parques, plazas, canchas y jardines (usos del suelo ya alineados con las calles)."""
    geoms = []
    for f in read_lines(DATA / 'intermedio/usos_suelo.geojsonl'):
        if f['properties'].get('clase') in ESPACIOS_ABIERTOS:
            g = shapely.make_valid(utm(shape(f['geometry'])))
            if g.area > 0:
                geoms.append(g)
    arr = np.asarray(geoms, dtype=object)
    return arr, STRtree(arr)


def in_open_space(geom, spaces, tree):
    hits = tree.query(geom, predicate='intersects')
    if not len(hits):
        return 0.0
    return shapely.area(shapely.intersection(geom, shapely.union_all(spaces[hits]))) / geom.area


def hide_overture_in_open_spaces(spaces, tree):
    """Huellas de Overture dentro de un parque, plaza o cancha (p. ej. glorietas o estrados que el
    satélite tomó por edificios). No se borran: se publican como ocultos automáticos y el mapa las
    filtra en 2D y en 2.5D/3D igual que una corrección local."""
    ids = []
    for f in read_lines(DATA / 'intermedio/original/edificios.geojsonl'):
        if in_open_space(utm(shape(f['geometry'])), spaces, tree) >= DENTRO_ESPACIO_ABIERTO:
            ids.append(f['properties']['id'])
    out = {'regla': f'Huella con ≥ {int(DENTRO_ESPACIO_ABIERTO * 100)} % dentro de un parque, plaza o cancha',
           'edificio': sorted(ids)}
    (DATA / 'coherencia/ocultos_automaticos.json').write_text(json.dumps(out, ensure_ascii=False, indent=2),
                                                              encoding='utf8')
    return len(ids)


def adjust_overture_tiles(corr, tree):
    """Recorta contra la calzada las huellas de Overture SOLO en la capa de teselas.

    La base (`bagua_master.edificio`), sus identificadores, alturas y vínculos no cambian: es la
    representación cartográfica la que deja de pisar la calle. Las que ocupan ≥ 40 % de calzada se
    dejan como están (no se pueden retirar y recortarlas las desfiguraría).
    """
    path = DATA / 'intermedio/edificios.geojsonl'
    original = keep_original(path, DATA / 'intermedio/original')
    counts = {'sin_invasion': 0, 'leve_1_10': 0, 'media_10_40': 0, 'severa_40_mas': 0}
    out, clipped, recortes = [], 0, []
    for f in read_lines(original):
        g = utm(shape(f['geometry']))
        motivo = 'suavizado'
        frac, zone = invasion_of(g, corr, tree)
        key = ('sin_invasion' if frac < 0.01 else 'leve_1_10' if frac < 0.10
               else 'media_10_40' if frac < INVASION_RETIRO else 'severa_40_mas')
        counts[key] += 1
        if key in ('leve_1_10', 'media_10_40'):
            cut = shapely.make_valid(g.difference(zone))
            polys = [p for p in getattr(cut, 'geoms', [cut]) if p.geom_type == 'Polygon']
            best = max(polys, key=lambda p: p.area) if polys else None
            if best is not None and best.area >= 0.5 * g.area:
                g = best.simplify(0.1)
                motivo = 'recorte_calzada'
                clipped += 1
        g = soften(g)
        f['geometry'] = mapping(geo(g))
        recortes.append({'type': 'Feature', 'properties': {'id': f['properties']['id'], 'motivo': motivo},
                         'geometry': f['geometry']})
        out.append(f)
    write_lines(path, out)
    # Las vistas 2.5D/3D usan la misma forma cartográfica (bagua_master.edificio_geom_mapa).
    write_lines(DATA / 'coherencia/edificios_recortados.geojsonl', recortes)
    counts['recortadas_en_teselas'] = clipped
    return counts


# Ancho dibujado de cada calle: el espacio libre entre fachadas, dentro de un rango por clase.
ANCHO_CALLE = {  # (mínimo = corredor de calzada, máximo) en metros
    'motorway': (9, 13), 'trunk': (9, 13), 'primary': (9, 12),
    'secondary': (7.5, 11), 'tertiary': (7.5, 11),
    'residential': (6, 9), 'unclassified': (6, 9), 'unknown': (6, 9), 'living_street': (6, 9),
    'service': (4, 6),
}
MARGEN_FACHADA = 0.4  # metros libres entre el borde dibujado de la calle y la fachada


def street_widths():
    """Añade `ancho_m` a cada tramo con edificios a ambos lados: dos veces la distancia libre del eje
    a la fachada más cercana (mediana a lo largo del tramo) menos un margen, acotado por clase. El
    mapa dibuja las calles debajo de los edificios: donde el tramo se estrecha, la fachada tapa el
    borde de la calle en vez de quedar pisada. Los tramos sin edificios
    a los dos lados (rurales) conservan el ancho de su clase."""
    buildings = [utm(shape(f['geometry'])) for f in read_lines(DATA / 'intermedio/edificios.geojsonl')]
    buildings += [utm(shape(f['geometry'])) for f in read_lines(DATA / 'complemento/edificios_complemento.geojsonl')]
    arr = np.asarray(buildings, dtype=object)
    tree = STRtree(arr)
    path = DATA / 'intermedio/red_vial.geojsonl'
    feats = read_lines(path)
    widths = []
    for f in feats:
        props = f['properties']
        clase = props.get('clase')
        if clase not in ANCHO_CALLE or props.get('doble_calzada') or f['geometry']['type'] != 'LineString':
            continue
        g = utm(shape(f['geometry']))
        free = []
        for t in np.linspace(0.1, 0.9, max(int(g.length / 8), 3)):
            p = g.interpolate(t, normalized=True)
            a, b = g.interpolate(max(t - 0.02, 0), normalized=True), g.interpolate(min(t + 0.02, 1), normalized=True)
            u = np.array([b.x - a.x, b.y - a.y])
            n = np.linalg.norm(u)
            if not n:
                continue
            nx, ny = -u[1] / n, u[0] / n
            sides = []
            for sign in (1, -1):
                ray = LineString([(p.x, p.y), (p.x + sign * nx * 15, p.y + sign * ny * 15)])
                hits = tree.query(ray, predicate='intersects')
                sides.append(min((arr[i].distance(p) for i in hits), default=None))
            if None not in sides:
                free.append(min(sides))
        if len(free) < 2:
            continue
        lo, hi = ANCHO_CALLE[clase]
        width = float(np.clip(2 * np.median(free) - MARGEN_FACHADA, lo, hi))
        props['ancho_m'] = round(width * 2) / 2
        widths.append(props['ancho_m'])
    write_lines(path, feats)
    return {'tramos_con_ancho': len(widths),
            'ancho_mediano_m': float(np.median(widths)) if widths else None}


# ---------------------------------------------------------------- 3. rutas
class Network:
    """Grafo de vértices de la red vial (UTM) y sus tramos elementales."""

    def __init__(self, roads):
        self.nodes, self.index, self.adj = [], {}, []
        seg_geoms, self.segs = [], []
        for rid, _, g in roads:
            coords = list(g.coords)
            ids = [self.node(c) for c in coords]
            for a, b in zip(ids, ids[1:]):
                if a == b:
                    continue
                length = math.dist(self.nodes[a], self.nodes[b])
                self.adj[a].append((b, length))
                self.adj[b].append((a, length))
                self.segs.append((a, b, rid, length))
                seg_geoms.append(LineString([self.nodes[a], self.nodes[b]]))
        self.seg_geoms = np.asarray(seg_geoms, dtype=object)
        self.tree = STRtree(self.seg_geoms)
        self.axes = STRtree(np.asarray([g for _, _, g in roads], dtype=object))

    def node(self, c):
        key = (round(c[0], 2), round(c[1], 2))
        if key not in self.index:
            self.index[key] = len(self.nodes)
            self.nodes.append(key)
            self.adj.append([])
        return self.index[key]

    def path(self, seg_a, t_a, seg_b, t_b, cutoff):
        """Camino más corto desde un punto de un tramo a otro punto de otro tramo."""
        a0, a1, _, la = self.segs[seg_a]
        b0, b1, _, lb = self.segs[seg_b]
        goal = {b0: t_b * lb, b1: (1 - t_b) * lb}
        dist = {a0: t_a * la, a1: (1 - t_a) * la}
        prev = {a0: None, a1: None}
        heap = [(d, n) for n, d in dist.items()]
        heapq.heapify(heap)
        best, best_node = math.inf, None
        while heap:
            d, n = heapq.heappop(heap)
            if d > dist.get(n, math.inf) or d > cutoff or d >= best:
                continue
            if n in goal and d + goal[n] < best:
                best, best_node = d + goal[n], n
            for m, w in self.adj[n]:
                nd = d + w
                if nd < dist.get(m, math.inf):
                    dist[m], prev[m] = nd, n
                    heapq.heappush(heap, (nd, m))
        if best_node is None or best > cutoff:
            return None
        chain, n = [], best_node
        while n is not None:
            chain.append(self.nodes[n])
            n = prev[n]
        return chain[::-1]


def sample(line, step):
    d = np.arange(0, line.length + 1e-9, step)
    if d[-1] < line.length:
        d = np.append(d, line.length)
    pts = shapely.line_interpolate_point(line, d)
    return np.column_stack([shapely.get_x(pts), shapely.get_y(pts)])


def best_translation(net, lines):
    pts = np.vstack([sample(l, MUESTRA_RUTA) for l in lines])

    def median(dx, dy):
        _, dd = net.axes.query_nearest(shapely.points(pts[:, 0] + dx, pts[:, 1] + dy), return_distance=True,
                                       all_matches=False)
        return float(np.median(dd))

    best, value = (0.0, 0.0), median(0, 0)
    for step, span, center in ((1.5, 15.0, (0.0, 0.0)), (0.5, 1.5, None)):
        cx, cy = center if center else best
        for dx in np.arange(cx - span, cx + span + 1e-9, step):
            for dy in np.arange(cy - span, cy + span + 1e-9, step):
                v = median(dx, dy)
                if v < value:
                    best, value = (round(float(dx), 2), round(float(dy), 2)), v
    return best


def match_line(net, line):
    """Ajusta una polilínea a la red: devuelve coordenadas y metros sin calle cercana."""
    pts = sample(line, MUESTRA_RUTA)
    states, prev_road = [], None
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        heading = np.array([b[0] - a[0], b[1] - a[1]])
        norm = np.linalg.norm(heading)
        heading = heading / norm if norm else heading
        p = Point(x, y)
        cands = net.tree.query(p, predicate='dwithin', distance=BUSQUEDA_RUTA)
        best, best_cost = None, math.inf
        for s in cands:
            seg = net.seg_geoms[s]
            d = seg.distance(p)
            (x0, y0), (x1, y1) = seg.coords
            v = np.array([x1 - x0, y1 - y0]) / max(net.segs[s][3], 1e-9)
            cost = d + 8.0 * (1 - abs(float(heading @ v))) + (0 if net.segs[s][2] == prev_road else 4.0)
            if cost < best_cost:
                best, best_cost = s, cost
        if best is None:
            states.append(None)
            prev_road = None
            continue
        seg = net.seg_geoms[best]
        t = seg.project(p, normalized=True)
        q = seg.interpolate(t, normalized=True)
        states.append((best, t, (q.x, q.y)))
        prev_road = net.segs[best][2]
    out, unmatched = [], 0.0
    for i, st in enumerate(states):
        if st is None:
            out.append(tuple(pts[i]))
            unmatched += MUESTRA_RUTA
            continue
        if out and i and states[i - 1] is not None and states[i - 1][0] != st[0]:
            pa = states[i - 1]
            euclid = math.dist(pa[2], st[2])
            chain = net.path(pa[0], pa[1], st[0], st[1], cutoff=3 * euclid + 40)
            if chain:
                out.extend(chain)
        out.append(st[2])
    return clean(out), unmatched


def clean(coords):
    """Quita duplicados y picos de ida y vuelta cortos que deja el ajuste."""
    pts = []
    for c in coords:
        if not pts or math.dist(pts[-1], c) > 0.05:
            pts.append(c)
    changed = True
    while changed and len(pts) > 2:
        changed = False
        out = [pts[0]]
        for i in range(1, len(pts) - 1):
            a, b, c = np.array(out[-1]), np.array(pts[i]), np.array(pts[i + 1])
            u, v = b - a, c - b
            nu, nv = np.linalg.norm(u), np.linalg.norm(v)
            if nu and nv and (u @ v) / (nu * nv) < -0.95 and min(nu, nv) < 20:
                changed = True
                continue
            out.append(pts[i])
        out.append(pts[-1])
        pts = out
    return pts


def adjust_routes(roads):
    path = DATA / 'rutas/rutas.json'
    original = keep_original(path, DATA / 'rutas/original')
    data = json.loads(original.read_text(encoding='utf8'))
    net = Network(roads)
    report = {}
    matched_lines = {}
    for r in data['rutas']:
        g = utm(shape(r['geometria']))
        parts = list(g.geoms) if hasattr(g, 'geoms') else [g]
        dx, dy = best_translation(net, parts)
        moved = [shapely.affinity.translate(p, dx, dy) for p in parts]
        new_parts, sin_calle = [], 0.0
        for p in moved:
            coords, unmatched = match_line(net, p)
            sin_calle += unmatched
            if len(coords) >= 2:
                new_parts.append(LineString(coords))
        ml = MultiLineString(new_parts)
        matched_lines[r['codigo']] = ml

        def stats(lines):
            pts = np.vstack([sample(l, MUESTRA_RUTA) for l in lines])
            _, dd = net.axes.query_nearest(shapely.points(pts[:, 0], pts[:, 1]), return_distance=True,
                                           all_matches=False)
            return round(float(np.median(dd)), 2), round(float(np.percentile(dd, 90)), 2)

        antes, despues = stats(parts), stats(new_parts)
        r['geometria_dwg'] = r['geometria']
        r['geometria'] = mapping(geo(ml))
        r['ajuste_coherencia'] = {
            'metodo': 'traslación por ruta + ajuste a la red vial (map matching)',
            'traslacion_m': [dx, dy],
            'distancia_mediana_antes_m': antes[0], 'distancia_p90_antes_m': antes[1],
            'distancia_mediana_despues_m': despues[0], 'distancia_p90_despues_m': despues[1],
            'tramos_sin_calle_m': round(sin_calle),
        }
        report[r['codigo']] = r['ajuste_coherencia']
        print(f"  {r['codigo']}: traslación {dx:+.1f},{dy:+.1f} m · mediana {antes[0]} → {despues[0]} m · "
              f"p90 {antes[1]} → {despues[1]} m · sin calle {round(sin_calle)} m", flush=True)

    # Flechas y marcadores: sobre el trazo ajustado de su ruta, con su sentido original.
    for a in data['flechas']:
        line = matched_lines[a['ruta']]
        p = Point(*TO_UTM.transform(a['lon'], a['lat']))
        part = min(line.geoms, key=lambda l: l.distance(p))
        s = part.project(p)
        q = part.interpolate(s)
        q0, q1 = part.interpolate(max(s - 2, 0)), part.interpolate(min(s + 2, part.length))
        bearing = math.degrees(math.atan2(q1.x - q0.x, q1.y - q0.y)) % 360
        if abs((bearing - a['rumbo'] + 180) % 360 - 180) > 90:
            bearing = (bearing + 180) % 360
        a['lon_dwg'], a['lat_dwg'], a['rumbo_dwg'] = a['lon'], a['lat'], a['rumbo']
        a['lon'], a['lat'] = (round(v, 8) for v in TO_GEO.transform(q.x, q.y))
        a['rumbo'] = round(bearing, 1)
        a['distancia_trazo_m'] = 0.0
    for m in data['marcadores']:
        line = matched_lines[m['ruta']]
        p = Point(*TO_UTM.transform(m['lon'], m['lat']))
        part = min(line.geoms, key=lambda l: l.distance(p))
        q = part.interpolate(part.project(p))
        m['lon_dwg'], m['lat_dwg'] = m['lon'], m['lat']
        m['lon'], m['lat'] = (round(v, 8) for v in TO_GEO.transform(q.x, q.y))
    data['aviso'] = ('Trazados de planos municipales (DWG) ajustados a la red vial para que circulen por las '
                     'calles; el trazo original del plano se conserva. No acreditan vigencia operativa ni '
                     'horarios.')
    data['ajuste_coherencia'] = 'scripts/bagua-master/ajustar_coherencia.py'
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
    tmp.replace(path)
    mark_adjusted(path)
    return report


def main():
    diag = json.loads((DATA / 'coherencia/diagnostico.json').read_text(encoding='utf8'))
    dx, dy = diag['desfase']['overture']['desfase_global_vias_m']
    print(f'1. Red vial y capas asociadas: traslación {dx:+.2f}, {dy:+.2f} m', flush=True)
    roads = shift_layers(dx, dy)
    print(f'  avenidas de doble calzada: {mark_dual_carriageways()} tramos marcados', flush=True)
    corr, tree = corridors(roads)
    print('2. Huellas complementarias ...', flush=True)
    spaces, spaces_tree = open_spaces()
    comp = adjust_complement(corr, tree, spaces, spaces_tree)
    print(f'  {comp}', flush=True)
    residual = adjust_overture_tiles(corr, tree)
    residual['ocultas_en_parques'] = hide_overture_in_open_spaces(spaces, spaces_tree)
    print(f'  Overture tras la traslación (recorte solo en teselas): {residual}', flush=True)
    anchos = street_widths()
    print(f'  ancho de calles según fachadas: {anchos}', flush=True)
    print('3. Rutas DWG ...', flush=True)
    routes = adjust_routes(roads)
    report = {'traslacion_red_vial_m': [dx, dy], 'capas_trasladadas': CAPAS_TRASLADADAS,
              'complemento': comp, 'overture_invasion_tras_traslacion': residual, 'anchos': anchos,
              'overture_invasion_antes': diag['invasion']['overture'], 'rutas': routes}
    (DATA / 'coherencia/ajuste.json').write_text(json.dumps(report, ensure_ascii=False, indent=2),
                                                 encoding='utf8')
    print('Escrito coherencia/ajuste.json', flush=True)


if __name__ == '__main__':
    main()
