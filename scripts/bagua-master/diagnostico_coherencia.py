"""Diagnóstico de coherencia interna: edificios y rutas frente a la red vial de Overture.

La red vial de Overture es la referencia (los DWG/CAD municipales no lo son). No modifica nada:
mide para decidir el método de ajuste.

  A. Invasión: cuánta superficie de cada huella cae dentro del corredor de calzada (eje de la vía
     con un semiancho MÍNIMO por clase; los senderos no cuentan).
  B. Desfase sistemático edificios↔vías: traslación de las vías que minimiza la invasión, global y
     por sector de 600 m. Si el óptimo es ~0 no hay sesgo; si es estable y no nulo, basta una
     traslación; si varía por sector, hace falta una deformación local.
  C. Rutas DWG: distancia de cada ruta (muestreada cada 5 m) al eje vial más cercano, y traslación
     que mejor las pega a las calles.

Salida: data/bagua-master/coherencia/diagnostico.json

  .venv-gis/Scripts/python scripts/bagua-master/diagnostico_coherencia.py
"""
import json
import time
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/bagua-master'
OUT = DATA / 'coherencia'
TO_UTM = Transformer.from_crs(4326, 32717, always_xy=True)

# Semiancho mínimo de CALZADA por clase (m): por debajo de esto una huella sobre la vía es
# incoherente con cualquier ancho real. Los senderos no se usan como corredor.
SEMIANCHO = {
    'motorway': 4.5, 'trunk': 4.5, 'primary': 4.5,
    'secondary': 3.75, 'tertiary': 3.75,
    'residential': 3.0, 'unclassified': 3.0, 'unknown': 3.0, 'living_street': 3.0,
    'service': 2.0,
}
SECTOR_M = 600
MUESTRA_VIA_M = 2.0
MUESTRA_RUTA_M = 5.0


def utm(geom):
    return shapely.transform(geom, lambda xy: np.column_stack(TO_UTM.transform(xy[:, 0], xy[:, 1])))


def source(rel):
    """Siempre mide sobre los originales: tras `ajustar_coherencia.py` quedan en `original/`."""
    path = DATA / rel
    original = path.parent / 'original' / path.name
    return original if original.exists() else path


def read_lines(path):
    with path.open(encoding='utf8') as stream:
        for line in stream:
            yield json.loads(line)


def load_roads():
    roads = []
    for f in read_lines(source('intermedio/red_vial.geojsonl')):
        clase = f['properties'].get('clase')
        if clase in SEMIANCHO and f['geometry']['type'] == 'LineString':
            roads.append((f['properties']['id'], clase, utm(shape(f['geometry']))))
    return roads


def load_buildings():
    out = []
    for f in read_lines(source('intermedio/edificios.geojsonl')):
        out.append(('overture', f['properties']['id'], utm(shape(f['geometry']))))
    path = source('complemento/edificios_complemento.geojsonl')
    if path.exists():
        for f in read_lines(path):
            out.append((f['properties']['fuente'], f['properties']['id'], utm(shape(f['geometry']))))
    return out


# ---------------------------------------------------------------- A. invasión
def invasion(roads, buildings):
    corridors = np.asarray([g.buffer(SEMIANCHO[c], cap_style='flat') for _, c, g in roads], dtype=object)
    tree = STRtree(corridors)
    geoms = np.asarray([g for _, _, g in buildings], dtype=object)
    pairs = tree.query(geoms, predicate='intersects')
    overlap = np.zeros(len(geoms))
    by_building = {}
    for b, r in pairs.T:
        by_building.setdefault(b, []).append(r)
    for b, rs in by_building.items():
        zone = shapely.union_all(corridors[rs])
        overlap[b] = shapely.area(shapely.intersection(geoms[b], zone))
    area = shapely.area(geoms)
    frac = np.divide(overlap, area, out=np.zeros_like(overlap), where=area > 0)
    bins = [('sin_invasion', 0, 0.01), ('leve_1_10', 0.01, 0.10), ('media_10_40', 0.10, 0.40),
            ('severa_40_mas', 0.40, 1.01)]
    sources = sorted({s for s, _, _ in buildings})
    result = {}
    for src in sources + ['todas']:
        mask = np.ones(len(buildings), bool) if src == 'todas' else np.asarray([s == src for s, _, _ in buildings])
        result[src] = {'huellas': int(mask.sum()),
                       **{name: int(((frac >= lo) & (frac < hi) & mask).sum()) for name, lo, hi in bins},
                       'superficie_invadida_m2': round(float(overlap[mask].sum()))}
    return result, frac


# ---------------------------------------------------------------- B. desfase edificios↔vías
def corridor_samples(roads):
    """Puntos que cubren cada calzada: cada 2 m a lo largo y cada 1 m a lo ancho."""
    xs, ys = [], []
    for _, clase, g in roads:
        n = max(int(g.length / MUESTRA_VIA_M), 1)
        d = np.linspace(0, g.length, n + 1)
        pts = shapely.line_interpolate_point(g, d)
        ahead = shapely.line_interpolate_point(g, np.minimum(d + 0.5, g.length))
        behind = shapely.line_interpolate_point(g, np.maximum(d - 0.5, 0))
        tx = shapely.get_x(ahead) - shapely.get_x(behind)
        ty = shapely.get_y(ahead) - shapely.get_y(behind)
        norm = np.hypot(tx, ty)
        norm[norm == 0] = 1
        nx, ny = -ty / norm, tx / norm
        w = SEMIANCHO[clase]
        for off in np.arange(-w + 0.5, w - 0.49, 1.0):
            xs.append(shapely.get_x(pts) + nx * off)
            ys.append(shapely.get_y(pts) + ny * off)
    return np.concatenate(xs), np.concatenate(ys)


def inside_count(tree, x, y, dx, dy):
    hits = tree.query(shapely.points(x + dx, y + dy), predicate='intersects')
    flag = np.zeros(len(x), bool)
    flag[hits[0]] = True
    return flag


def best_shift(tree, x, y, sector, n_sectors, span=6.0, step=1.0, fine=0.25):
    grid = np.arange(-span, span + 1e-9, step)
    counts = {}
    per_sector = {}
    for dx in grid:
        for dy in grid:
            flag = inside_count(tree, x, y, dx, dy)
            counts[(dx, dy)] = int(flag.sum())
            per_sector[(dx, dy)] = np.bincount(sector[flag], minlength=n_sectors)
    (bx, by) = min(counts, key=counts.get)
    for dx in np.arange(bx - step, bx + step + 1e-9, fine):
        for dy in np.arange(by - step, by + step + 1e-9, fine):
            key = (round(float(dx), 2), round(float(dy), 2))
            if key not in counts:
                flag = inside_count(tree, x, y, dx, dy)
                counts[key] = int(flag.sum())
    (fx, fy) = min(counts, key=counts.get)
    return counts, per_sector, (float(fx), float(fy)), grid


def offsets(roads, buildings):
    x, y = corridor_samples(roads)
    x0, y0 = x.min(), y.min()
    cols = int((x.max() - x0) // SECTOR_M) + 1
    sector = ((y - y0) // SECTOR_M).astype(int) * cols + ((x - x0) // SECTOR_M).astype(int)
    n_sectors = int(sector.max()) + 1
    groups = {'overture': [g for s, _, g in buildings if s == 'overture'],
              'complemento': [g for s, _, g in buildings if s != 'overture']}
    report = {'muestras_calzada': int(len(x))}
    for name, geoms in groups.items():
        if not geoms:
            continue
        tree = STRtree(np.asarray(geoms, dtype=object))
        t = time.time()
        counts, per_sector, (fx, fy), grid = best_shift(tree, x, y, sector, n_sectors)
        base = counts[(0.0, 0.0)]
        # Las vías se trasladan (fx, fy); equivale a mover los edificios (-fx, -fy).
        sectors = []
        totals0 = per_sector[(0.0, 0.0)]
        for s in range(n_sectors):
            if totals0[s] < 150:  # sin invasión suficiente para estimar
                continue
            best = min(per_sector, key=lambda k: per_sector[k][s])
            sectors.append({'sector': s, 'centro_utm': [round(x0 + (s % cols + 0.5) * SECTOR_M),
                                                        round(y0 + (s // cols + 0.5) * SECTOR_M)],
                            'muestras_invadidas': int(totals0[s]),
                            'desfase_vias_m': [float(best[0]), float(best[1])],
                            'reduccion_pct': round(100 * (1 - per_sector[best][s] / totals0[s]), 1)})
        shifts = np.asarray([s['desfase_vias_m'] for s in sectors]) if sectors else np.zeros((0, 2))
        report[name] = {
            'huellas': len(geoms),
            'muestras_invadidas_sin_mover': base,
            'desfase_global_vias_m': [fx, fy],
            'desfase_global_modulo_m': round(float(np.hypot(fx, fy)), 2),
            'muestras_invadidas_con_desfase': counts[(round(fx, 2), round(fy, 2))]
            if (round(fx, 2), round(fy, 2)) in counts else counts[(fx, fy)],
            'reduccion_global_pct': round(100 * (1 - min(counts.values()) / base), 1) if base else 0,
            'sectores_estimados': len(sectors),
            'dispersion_sectores_m': (round(float(np.std(shifts[:, 0])), 2), round(float(np.std(shifts[:, 1])), 2))
            if len(sectors) else None,
            'sectores': sectors,
            'segundos': round(time.time() - t, 1),
        }
        print(f'  {name}: desfase global vías {fx:+.2f},{fy:+.2f} m · invasión {base} → '
              f'{min(counts.values())} muestras · {len(sectors)} sectores', flush=True)
    return report


# ---------------------------------------------------------------- C. rutas DWG
def routes_report(roads):
    data = json.loads(source('rutas/rutas.json').read_text(encoding='utf8'))
    axes = np.asarray([g for _, _, g in roads], dtype=object)
    tree = STRtree(axes)
    report = {}
    all_x, all_y = [], []
    for r in data['rutas']:
        g = utm(shape(r['geometria']))
        parts = list(g.geoms) if hasattr(g, 'geoms') else [g]
        xs, ys = [], []
        for part in parts:
            d = np.arange(0, part.length + 1e-9, MUESTRA_RUTA_M)
            p = shapely.line_interpolate_point(part, d)
            xs.append(shapely.get_x(p))
            ys.append(shapely.get_y(p))
        x, y = np.concatenate(xs), np.concatenate(ys)
        all_x.append(x)
        all_y.append(y)

        def dist(dx, dy):
            _, dd = tree.query_nearest(shapely.points(x + dx, y + dy), return_distance=True, all_matches=False)
            return dd

        d0 = dist(0, 0)
        best, bestv = (0.0, 0.0), np.median(d0)
        for dx in np.arange(-15, 15.01, 1.5):
            for dy in np.arange(-15, 15.01, 1.5):
                v = np.median(dist(dx, dy))
                if v < bestv:
                    best, bestv = (float(dx), float(dy)), v
        d1 = dist(*best)
        report[r['codigo']] = {
            'nombre': r.get('nombre'), 'longitud_m': round(float(g.length)), 'muestras': int(len(x)),
            'distancia_mediana_m': round(float(np.median(d0)), 2),
            'distancia_p90_m': round(float(np.percentile(d0, 90)), 2),
            'fuera_de_calle_10m_pct': round(100 * float((d0 > 10).mean()), 1),
            'traslacion_optima_m': list(best),
            'mediana_trasladada_m': round(float(np.median(d1)), 2),
            'p90_trasladada_m': round(float(np.percentile(d1, 90)), 2),
        }
        print(f"  {r['codigo']}: mediana {np.median(d0):.1f} m, p90 {np.percentile(d0, 90):.1f} m · "
              f"traslación {best} → mediana {np.median(d1):.1f} m", flush=True)
    return report


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print('Cargando ...', flush=True)
    roads, buildings = load_roads(), load_buildings()
    print(f'{len(roads)} ejes viales con calzada, {len(buildings)} huellas', flush=True)
    print('A. Invasión del corredor de calzada ...', flush=True)
    inv, _ = invasion(roads, buildings)
    for k, v in inv.items():
        print(f'  {k}: {v}', flush=True)
    print('B. Desfase edificios↔vías ...', flush=True)
    off = offsets(roads, buildings)
    print('C. Rutas DWG ...', flush=True)
    rts = routes_report(roads)
    result = {'referencia': 'Red vial Overture (ejes); semianchos mínimos de calzada por clase',
              'semiancho_m': SEMIANCHO, 'sector_m': SECTOR_M,
              'invasion': inv, 'desfase': off, 'rutas': rts}
    (OUT / 'diagnostico.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    print('Escrito', OUT / 'diagnostico.json', flush=True)


if __name__ == '__main__':
    main()
