"""Fusión jerárquica de huellas de edificaciones para BAGUA MASTER (capa complementaria).

Overture es la base INMUTABLE: sus identificadores GERS están referenciados por alturas,
vínculos espaciales y expedientes, y sus PMTiles no se reconstruyen. Por eso esta fusión nunca
modifica ni reemplaza una huella de Overture: solo AÑADE huellas de otras fuentes abiertas que
Overture no tiene. Orden de inserción:

    Overture (base, ya aceptada) -> OSM -> Google Open Buildings v3 (crudo) -> Microsoft
    -> presencia temporal de Google 2.5D (opcional, `--presencia`)

Una huella candidata entra solo si:
  1. es válida y su superficie está en el rango de la fuente (15 a 5 000 m² para las inferidas);
  2. no cae sobre agua de Overture (falsos positivos en cauces);
  3. se solapa menos del 25 % de su superficie con lo ya aceptado, y ninguna huella ya aceptada
     tiene la mitad o más de su superficie dentro de la candidata (evita duplicar casas dibujadas
     por dos fuentes con un metro de desfase y evita cubrir una huella que ya existe);
  4. entre candidatas de la misma fuente se conserva la de mayor confianza, luego la mayor.

Todo se calcula en UTM 17S (EPSG:32717). Cada huella nueva conserva su `fuente`,
`confianza_geo` (alta/media/baja), el registro de origen y el método de regularización; nada se
presenta como predio ni como dato validado en campo.

Salida (local, excluida de Git): data/bagua-master/complemento/
  - edificios_complemento.geojsonl   huellas aceptadas (WGS84) con atributos de procedencia
  - fusion.json                      embudo por fuente, control de cobertura, SHA-256 de entradas

Uso: .venv-gis/Scripts/python scripts/bagua-master/fusionar_edificaciones.py [--presencia]
"""
import argparse
import datetime
import gzip
import hashlib
import json
from pathlib import Path

import duckdb
import numpy as np
import shapely
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import Polygon, box, shape

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'scripts/bagua-master/ambito.json'
DATA = ROOT / 'data/bagua-master'
OUT = DATA / 'complemento'
RAW = OUT / 'crudo'

MAX_SOLAPE_CANDIDATA = 0.25  # fracción de la candidata ya cubierta por huellas aceptadas
MAX_CUBIERTA_ACEPTADA = 0.50  # fracción de una aceptada que quedaría dentro de la candidata
AREA_MIN, AREA_MAX = 15.0, 5000.0  # m², solo fuentes inferidas por aprendizaje automático
IOU_RECTANGULO = 0.90  # umbral para sustituir una huella casi rectangular por su rectángulo mínimo
TOL_SIMPLIFICAR = 0.25  # m

TO_UTM = Transformer.from_crs('EPSG:4326', 'EPSG:32717', always_xy=True)
TO_WGS = Transformer.from_crs('EPSG:32717', 'EPSG:4326', always_xy=True)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def project(geoms, transformer):
    def apply(coords):
        x, y = transformer.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return shapely.transform(np.asarray(geoms, dtype=object), apply)


def polygons_only(geom):
    """Reduce una geometría a su polígono principal (MultiPolygon -> el de mayor área)."""
    if geom is None or geom.is_empty:
        return None
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
    if geom.geom_type == 'Polygon':
        return geom
    parts = [g for g in getattr(geom, 'geoms', []) if g.geom_type == 'Polygon' and not g.is_empty]
    if not parts:
        return None
    return max(parts, key=lambda g: g.area)


# ---------------------------------------------------------------- lectura de fuentes

def load_overture(con, cfg):
    path = DATA / 'descarga' / cfg['overture']['version'] / 'buildings_building.parquet'
    rows = con.execute(
        f"SELECT id, ST_AsWKB(geometry) FROM read_parquet('{path.as_posix()}') "
        "WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry) ORDER BY id"
    ).fetchall()
    ids = [r[0] for r in rows]
    geoms = [shapely.from_wkb(bytes(r[1])) for r in rows]
    return ids, geoms


def load_water(con, cfg):
    path = DATA / 'descarga' / cfg['overture']['version'] / 'base_water.parquet'
    rows = con.execute(
        f"SELECT ST_AsWKB(geometry) FROM read_parquet('{path.as_posix()}') "
        "WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry) "
        "AND CAST(ST_GeometryType(geometry) AS VARCHAR) IN ('POLYGON','MULTIPOLYGON')"
    ).fetchall()
    return [shapely.from_wkb(bytes(r[0])) for r in rows]


def in_bbox(geom, bbox):
    xmin, ymin, xmax, ymax = geom.bounds
    return xmax >= bbox[0] and xmin <= bbox[2] and ymax >= bbox[1] and ymin <= bbox[3]


def load_osm(bbox):
    path = RAW / 'osm_buildings.json'
    if not path.exists():
        return [], [], {}
    data = json.loads(path.read_text(encoding='utf8'))
    records = []
    for el in data['elements']:
        if el['type'] != 'way' or 'geometry' not in el:
            continue
        ring = [(p['lon'], p['lat']) for p in el['geometry']]
        if len(ring) < 4 or ring[0] != ring[-1]:
            continue
        tags = el.get('tags', {})
        if 'building' not in tags:
            continue  # building:part no es una huella independiente
        geom = polygons_only(Polygon(ring))
        if geom is not None and in_bbox(geom, bbox):
            records.append((f"way/{el['id']}", geom, {
                'osm_building': tags.get('building'), 'nombre': tags.get('name'),
                'osm_levels': tags.get('building:levels'), 'osm_height': tags.get('height'),
            }))
    meta = {'archivo': path.name, 'sha256': sha256(path),
            'osm_base': data.get('osm3s', {}).get('timestamp_osm_base')}
    return [r[0] for r in records], [r[1] for r in records], {'attrs': [r[2] for r in records], **meta}


def load_microsoft(bbox):
    geoms, ids, files = [], [], []
    for path in sorted(RAW.glob('ms_*.csv.gz')):
        files.append({'archivo': path.name, 'sha256': sha256(path)})
        with gzip.open(path, 'rt', encoding='utf8') as stream:
            for line in stream:
                feature = json.loads(line)
                geom = polygons_only(shape(feature['geometry']))
                if geom is not None and in_bbox(geom, bbox):
                    geoms.append(geom)
                    # Microsoft no publica identificador: clave estable = coordenadas redondeadas a 7 decimales.
                    digest = hashlib.sha1(shapely.to_wkt(geom, rounding_precision=7).encode('ascii')).hexdigest()
                    ids.append(f'ms:{digest[:16]}')
    return ids, geoms, {'archivos': files}


def load_google(con, bbox):
    path = RAW / 'google_91b_buildings.csv.gz'
    if not path.exists():
        return [], [], [], {}
    try:
        rows = con.execute(
            "SELECT full_plus_code, confidence, geometry FROM read_csv(?, header=true) "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?",
            [path.as_posix(), bbox[1], bbox[3], bbox[0], bbox[2]],
        ).fetchall()
    except duckdb.Error as error:
        print(f'  Google: archivo incompleto o ilegible ({error}); se omite.')
        return [], [], [], {}
    ids, confs, geoms = [], [], []
    for code, conf, wkt in rows:
        geom = polygons_only(shapely.from_wkt(wkt))
        if geom is not None:
            ids.append(code)
            confs.append(float(conf))
            geoms.append(geom)
    return ids, confs, geoms, {'archivo': path.name, 'sha256': sha256(path)}


# ---------------------------------------------------------------- conflación

def overlap_stats(candidates, tree, accepted):
    """Fracción de cada candidata cubierta por lo aceptado y máxima fracción cubierta de una aceptada."""
    cover = np.zeros(len(candidates))
    inside = np.zeros(len(candidates))
    if len(candidates) == 0 or len(accepted) == 0:
        return cover, inside
    ci, ti = tree.query(candidates, predicate='intersects')
    if len(ci) == 0:
        return cover, inside
    inter = shapely.area(shapely.intersection(candidates[ci], accepted[ti]))
    cand_area = shapely.area(candidates)
    acc_area = shapely.area(accepted)
    np.add.at(cover, ci, inter)
    np.maximum.at(inside, ci, inter / np.maximum(acc_area[ti], 1e-9))
    return np.minimum(cover / np.maximum(cand_area, 1e-9), 1.0), inside


def conflate(cands, order_key, tree, accepted, water_tree, water, filter_area):
    """Devuelve (índices aceptados, embudo). `cands` ya está en UTM y es válido."""
    funnel = {'leidas': len(cands)}
    area = shapely.area(cands)
    keep = np.ones(len(cands), dtype=bool)
    if filter_area:
        bad = (area < AREA_MIN) | (area > AREA_MAX)
        funnel['descartadas_por_area'] = int(bad.sum())
        keep &= ~bad
    if water_tree is not None and len(water):
        wi, wj = water_tree.query(cands, predicate='intersects')
        wet = np.zeros(len(cands))
        if len(wi):
            np.add.at(wet, wi, shapely.area(shapely.intersection(cands[wi], water[wj])))
        in_water = (wet / np.maximum(area, 1e-9)) >= 0.5
        funnel['descartadas_por_agua'] = int((in_water & keep).sum())
        keep &= ~in_water
    cover, inside = overlap_stats(cands, tree, accepted)
    dup = (cover >= MAX_SOLAPE_CANDIDATA) | (inside >= MAX_CUBIERTA_ACEPTADA)
    funnel['duplicadas_de_fuentes_previas'] = int((dup & keep).sum())
    keep &= ~dup
    survivors = np.flatnonzero(keep)
    # Entre candidatas de la misma fuente: mayor confianza y luego mayor superficie.
    survivors = sorted(survivors, key=lambda i: (-order_key[i], -area[i], i))
    local = STRtree(cands)
    chosen = []
    chosen_set = set()
    dup_same = 0
    for i in survivors:
        clash = False
        for j in local.query(cands[i], predicate='intersects'):
            if j == i or j not in chosen_set:
                continue
            inter = shapely.area(shapely.intersection(cands[i], cands[j]))
            if inter / area[i] >= MAX_SOLAPE_CANDIDATA or inter / area[j] >= MAX_CUBIERTA_ACEPTADA:
                clash = True
                break
        if clash:
            dup_same += 1
        else:
            chosen.append(i)
            chosen_set.add(i)
    funnel['duplicadas_en_la_misma_fuente'] = dup_same
    funnel['aceptadas'] = len(chosen)
    return chosen, funnel


def regularize(geom):
    """Endereza bordes: rectángulo mínimo si la huella ya es casi rectangular; si no, simplifica."""
    rect = geom.minimum_rotated_rectangle
    union = geom.union(rect).area
    iou = geom.intersection(rect).area / union if union else 0.0
    if iou >= IOU_RECTANGULO and rect.geom_type == 'Polygon' and rect.is_valid:
        return rect, 'rectangulo', round(iou, 3)
    simple = geom.simplify(TOL_SIMPLIFICAR, preserve_topology=True)
    if simple.is_valid and simple.geom_type == 'Polygon' and not simple.is_empty:
        return simple, 'simplificada', round(iou, 3)
    return geom, 'ninguna', round(iou, 3)


# ---------------------------------------------------------------- control de cobertura

def coverage(buildings, lots, zones):
    """Qué fracción de los lotes CAD y de la superficie de zonas tiene alguna huella."""
    arr = np.asarray(buildings, dtype=object)
    tree = STRtree(arr)
    li, bi = tree.query(lots, predicate='intersects')
    inter = shapely.area(shapely.intersection(lots[li], arr[bi])) if len(li) else np.array([])
    lot_cover = np.zeros(len(lots))
    if len(li):
        np.add.at(lot_cover, li, inter)
    frac = lot_cover / np.maximum(shapely.area(lots), 1e-9)
    with_building = int((frac >= 0.05).sum())
    union = shapely.union_all(arr)
    z_area = float(sum(z.area for z in zones))
    z_cover = float(sum(z.intersection(union).area for z in zones))
    return {
        'lotes_cad': int(len(lots)),
        'lotes_con_huella': with_building,
        'lotes_con_huella_pct': round(100 * with_building / max(len(lots), 1), 1),
        'zonas_m2': round(z_area),
        'zonas_cubiertas_m2': round(z_cover),
        'zonas_cubiertas_pct': round(100 * z_cover / max(z_area, 1), 2),
    }


def read_control(name, to_utm=True):
    path = OUT / 'control' / name
    if not path.exists():
        return np.array([], dtype=object)
    feats = json.loads(path.read_text(encoding='utf8'))['features']
    geoms = [polygons_only(shape(f['geometry'])) for f in feats if f.get('geometry')]
    return project([g for g in geoms if g is not None], TO_UTM)


def stable_id(prefix, key):
    return f"cmp-{prefix}-{hashlib.sha1(key.encode('utf8')).hexdigest()[:12]}"


def write_occupied(accepted):
    """Huellas vectoriales (WGS84) que sirven de máscara a la detección por presencia ráster."""
    OUT.mkdir(parents=True, exist_ok=True)
    wgs = shapely.transform(np.asarray(accepted, dtype=object),
                            lambda c: np.column_stack(TO_WGS.transform(c[:, 0], c[:, 1])))
    with (OUT / 'ocupado_vectorial.geojsonl').open('w', encoding='utf8', newline='\n') as stream:
        for geom in wgs:
            stream.write(shapely.to_geojson(shapely.set_precision(geom, 1e-7)) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--presencia', action='store_true',
                        help='Incluye candidatas de presencia temporal de Google (prepara_presencia.py).')
    args = parser.parse_args()
    cfg = json.loads(CONFIG.read_text(encoding='utf8'))
    bbox = cfg['ambito']['descarga_bbox']
    con = duckdb.connect()
    con.execute('INSTALL spatial; LOAD spatial;')

    print('Leyendo fuentes ...', flush=True)
    ov_ids, ov_geoms = load_overture(con, cfg)
    water = project(load_water(con, cfg), TO_UTM)
    base = project(ov_geoms, TO_UTM)
    base = np.asarray([polygons_only(g) or g for g in base], dtype=object)
    sources = []  # (clave, ids, geoms WGS, confianzas, atributos, metadatos, filtrar_area, confianza_texto)
    osm_ids, osm_geoms, osm_meta = load_osm(bbox)
    sources.append(('osm', osm_ids, osm_geoms, [1.0] * len(osm_ids), osm_meta.pop('attrs', [{}] * len(osm_ids)), osm_meta,
                    False, lambda c: 'alta'))
    g_ids, g_conf, g_geoms, g_meta = load_google(con, bbox)
    sources.append(('google_ob_raw', g_ids, g_geoms, g_conf, [{}] * len(g_ids), g_meta, True,
                    lambda c: 'media' if c >= 0.75 else 'baja'))
    m_ids, m_geoms, m_meta = load_microsoft(bbox)
    sources.append(('ms_buildings', m_ids, m_geoms, [0.5] * len(m_ids), [{}] * len(m_ids), m_meta, True,
                    lambda c: 'media'))
    if args.presencia:
        p_path = OUT / 'presencia_google.geojsonl'
        if p_path.exists():
            feats = [json.loads(l) for l in p_path.read_text(encoding='utf8').splitlines() if l.strip()]
            p_geoms = [shape(f['geometry']) for f in feats]
            sources.append(('google_presencia', [f['properties']['id'] for f in feats], p_geoms,
                            [f['properties'].get('presencia', 0.7) for f in feats],
                            [{} for _ in feats], {'archivo': p_path.name, 'sha256': sha256(p_path)}, True,
                            lambda c: 'baja'))

    water_tree = STRtree(water) if len(water) else None
    accepted = list(base)
    tree = STRtree(np.asarray(accepted, dtype=object))
    embudo, features, counters = {}, [], {}
    occupied_written = False
    for key, ids, geoms_wgs, confs, attrs, meta, filtrar, label in sources:
        if key == 'google_presencia':
            write_occupied(accepted)  # estado vectorial: lo que ninguna fuente de huellas ya cubre
            occupied_written = True
        if not ids:
            embudo[key] = {'leidas': 0, 'nota': 'Sin datos descargados para esta fuente.', **meta}
            continue
        print(f'Conflando {key}: {len(ids)} candidatas ...', flush=True)
        cands = project(geoms_wgs, TO_UTM)
        cands = np.asarray([polygons_only(g) for g in cands], dtype=object)
        valid = np.array([g is not None for g in cands])
        cands_ok = cands.copy()
        cands_ok[~valid] = Polygon()
        chosen, funnel = conflate(cands_ok, np.asarray(confs), tree, np.asarray(accepted, dtype=object),
                                  water_tree, water, filtrar)
        funnel['invalidas'] = int((~valid).sum())
        funnel.update(meta)
        embudo[key] = funnel
        for i in chosen:
            geom, method, iou = (cands_ok[i], 'ninguna', None) if key == 'osm' else regularize(cands_ok[i])
            accepted.append(geom)
            wgs = shapely.transform(geom, lambda c: np.column_stack(TO_WGS.transform(c[:, 0], c[:, 1])))
            props = {
                'id': stable_id(key, ids[i]),
                'fuente': key,
                'confianza_geo': label(confs[i]),
                'confianza_valor': round(confs[i], 4) if key.startswith('google') else None,
                'registro_fuente': ids[i] if not ids[i].startswith('ms:') else None,
                'area_m2': round(float(geom.area), 1),
                'regularizacion': method,
                'iou_rectangulo': iou,
                **{k: v for k, v in attrs[i].items() if v},
            }
            features.append({'type': 'Feature', 'properties': {k: v for k, v in props.items() if v is not None},
                             'geometry': json.loads(shapely.to_geojson(shapely.set_precision(wgs, 1e-7)))})
        tree = STRtree(np.asarray(accepted, dtype=object))
        print(f"  {key}: {funnel}", flush=True)
        counters[key] = len(chosen)

    if not occupied_written:
        write_occupied(accepted)

    # Control de cobertura contra los lotes CAD municipales y las zonas (solo medición).
    lots, zones = read_control('lotes_cad.geojson'), read_control('zonas.geojson')
    control = None
    if len(lots) and len(zones):
        added = [shapely.transform(shape(f['geometry']), lambda c: np.column_stack(TO_UTM.transform(c[:, 0], c[:, 1])))
                 for f in features]
        control = {'solo_overture': coverage(base, lots, zones),
                   'con_complemento': coverage(list(base) + added, lots, zones)}
    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / 'edificios_complemento.geojsonl'
    features.sort(key=lambda f: f['properties']['id'])
    with out_path.open('w', encoding='utf8', newline='\n') as stream:
        for f in features:
            stream.write(json.dumps(f, ensure_ascii=False, separators=(',', ':')) + '\n')
    report = {
        'generado_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'base_overture': {'version': cfg['overture']['version'], 'huellas': len(ov_ids)},
        'bbox': bbox,
        'criterios': {'solape_maximo_candidata': MAX_SOLAPE_CANDIDATA, 'cubierta_maxima_aceptada': MAX_CUBIERTA_ACEPTADA,
                      'area_m2': [AREA_MIN, AREA_MAX], 'iou_rectangulo': IOU_RECTANGULO,
                      'tolerancia_simplificacion_m': TOL_SIMPLIFICAR, 'crs_metrico': 'EPSG:32717'},
        'embudo_por_fuente': embudo,
        'aceptadas_por_fuente': counters,
        'total_complemento': len(features),
        'total_con_overture': len(ov_ids) + len(features),
        'control_cobertura': control,
        'salida': {'archivo': out_path.name, 'sha256': sha256(out_path)},
    }
    (OUT / 'fusion.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({k: report[k] for k in ('aceptadas_por_fuente', 'total_complemento', 'total_con_overture',
                                              'control_cobertura')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
