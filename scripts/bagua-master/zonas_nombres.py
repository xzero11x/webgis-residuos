"""Resumen de calles con y sin nombre de Overture por zona (BAGUA MASTER).

Solo lee el Parquet verificado de Overture 2026-09-23.1 (transportation/segment). No modifica
datos. Las zonas son núcleos urbanos detectados con las propias vías: los puntos medios de las
calles locales (residential, service, living_street, unknown, tertiary) se agrupan si están a
menos de 150 m; cada núcleo recibe las vías de cualquier clase cuyo punto medio queda a menos
de 150 m del casco convexo del núcleo. Lo demás es «Red interurbana y rural».

- «Bagua Capital»: el núcleo mayor.
- «Tomaque»: el núcleo que corta la ventana de Tomaque (los mismos límites que la vista
  «Tomaque» de la Ruta 2026 del mapa municipal; solo se usan como ventana geográfica).
- Resto: «Núcleo N» con su centro; no se les inventa nombre.

Salida: data/bagua-master/nombres/zonas.json (resumen, y la zona de cada vía por id).
Uso: .venv-gis/Scripts/python scripts/bagua-master/zonas_nombres.py
"""
import collections
import json
import math
from pathlib import Path

import duckdb
from shapely.geometry import MultiPoint, Point, box

ROOT = Path(__file__).resolve().parents[2]
PARQUET = ROOT / 'data/bagua-master/descarga/2026-09-23.1/transportation_segment.parquet'
OUT = ROOT / 'data/bagua-master/nombres/zonas.json'
LOCAL = {'residential', 'service', 'living_street', 'unknown', 'tertiary'}
LINK_M = 150
MIN_SEGMENTS = 8
TOMAQUE = box(-78.5108, -5.6553, -78.5, -5.6424)
M_LAT = 110_574.0
M_LON = 111_320.0 * math.cos(math.radians(5.64))


def metres(lon, lat):
    return lon * M_LON, lat * M_LAT


def main():
    con = duckdb.connect()
    con.execute('INSTALL spatial; LOAD spatial;')
    rows = con.execute(
        f"""SELECT id, class, names.primary, ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry)),
                   ST_Length_Spheroid(ST_FlipCoordinates(geometry))
            FROM read_parquet('{PARQUET.as_posix()}') ORDER BY id"""
    ).fetchall()
    local = [r for r in rows if r[1] in LOCAL]
    parent = list(range(len(local)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    grid = collections.defaultdict(list)
    for i, r in enumerate(local):
        x, y = metres(r[3], r[4])
        grid[(int(x // LINK_M), int(y // LINK_M))].append(i)
    for i, r in enumerate(local):
        x, y = metres(r[3], r[4])
        cx, cy = int(x // LINK_M), int(y // LINK_M)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    x2, y2 = metres(local[j][3], local[j][4])
                    if j > i and math.hypot(x - x2, y - y2) <= LINK_M:
                        parent[find(j)] = find(i)
    groups = collections.defaultdict(list)
    for i in range(len(local)):
        groups[find(i)].append(i)
    nuclei = sorted((g for g in groups.values() if len(g) >= MIN_SEGMENTS), key=len, reverse=True)
    hulls = []
    for g in nuclei:
        pts = [Point(local[i][3], local[i][4]) for i in g]
        hull = MultiPoint(pts).convex_hull.buffer(LINK_M / M_LON)
        hulls.append(hull)
    zones = []
    for n, (g, hull) in enumerate(zip(nuclei, hulls)):
        c = hull.centroid
        if n == 0:
            name = 'Bagua Capital'
        elif hull.intersects(TOMAQUE):
            name = 'Tomaque'
        else:
            name = f'Núcleo {n} ({c.x:.4f}, {c.y:.4f})'
        zones.append({'nombre': name, 'centro': [round(c.x, 5), round(c.y, 5)], 'bbox': [round(v, 5) for v in hull.bounds], 'hull': hull})
    assignment = {}
    for r in rows:
        p = Point(r[3], r[4])
        zone = next((z['nombre'] for z in zones if z['hull'].contains(p)), 'Red interurbana y rural')
        assignment[r[0]] = zone
    summary = collections.OrderedDict()
    for r in rows:
        z = assignment[r[0]]
        s = summary.setdefault(z, {'segmentos': 0, 'con_nombre': 0, 'sin_nombre': 0, 'km': 0.0, 'km_con_nombre': 0.0,
                                   'por_clase': collections.defaultdict(lambda: [0, 0])})
        s['segmentos'] += 1
        s['km'] += r[5] / 1000
        if r[2]:
            s['con_nombre'] += 1
            s['km_con_nombre'] += r[5] / 1000
        else:
            s['sin_nombre'] += 1
        s['por_clase'][r[1]][0 if r[2] else 1] += 1
    for z in summary.values():
        z['km'] = round(z['km'], 2)
        z['km_con_nombre'] = round(z['km_con_nombre'], 2)
        z['pct_con_nombre'] = round(100 * z['con_nombre'] / z['segmentos'], 1)
        z['por_clase'] = {k: {'con_nombre': v[0], 'sin_nombre': v[1]} for k, v in sorted(z['por_clase'].items())}
    result = {
        'version_overture': '2026-09-23.1',
        'metodo': f'Núcleos por proximidad de calles locales ({LINK_M} m, mínimo {MIN_SEGMENTS} tramos).',
        'zonas': [{k: v for k, v in z.items() if k != 'hull'} for z in zones],
        'resumen': summary,
        'total': {'segmentos': len(rows), 'con_nombre': sum(1 for r in rows if r[2]), 'sin_nombre': sum(1 for r in rows if not r[2])},
        'zona_por_id': assignment,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps({'total': result['total']}, ensure_ascii=False))
    for name, s in summary.items():
        print(f"{name:42s} seg {s['segmentos']:4d}  con {s['con_nombre']:4d}  sin {s['sin_nombre']:4d}  ({s['pct_con_nombre']}% )  km {s['km']}")


if __name__ == '__main__':
    main()
