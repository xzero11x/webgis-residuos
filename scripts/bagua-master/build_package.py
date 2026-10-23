"""Construye el paquete de importación y los GeoJSON intermedios de BAGUA MASTER.

Lee los Parquet verificados por overture_download.py (solo lectura) y genera:
  - data/bagua-master/paquete/elementos.json.gz   paquete para importar en bagua_master
  - data/bagua-master/intermedio/<capa>.geojsonl  entrada de tippecanoe (teselas)
  - data/bagua-master/paquete/manifiesto.json     SHA-256 de ambos y procedencia

Solo se incluyen geometrías presentes y no vacías. Las nulas y vacías se cuentan en el
inventario y no se sustituyen. Las inválidas se conservan con geom_valida = false.
Ningún atributo se inventa: los campos ausentes en Overture quedan nulos o fuera.

Uso: .venv-gis/Scripts/python scripts/bagua-master/build_package.py
"""
import datetime
import gzip
import hashlib
import json
from pathlib import Path

import duckdb
from pyproj import Geod
from shapely.geometry import shape

GEOD = Geod(ellps='WGS84')

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'scripts/bagua-master/ambito.json'
DATA = ROOT / 'data/bagua-master'

# Tabla de destino por conjunto de Overture.
TABLES = {
    'transportation_segment': 'red_vial',
    'transportation_connector': 'conector',
    'buildings_building': 'edificio',
    'buildings_building_part': 'parte_edificio',
    'base_land_use': 'uso_suelo',
    'base_water': 'agua',
    'base_land': 'terreno',
    'places_place': 'lugar',
}
# Capa de teselas por conjunto (solo los que aportan al mapa urbano de esta fase).
TILE_LAYERS = {
    'transportation_segment': 'red_vial',
    'transportation_connector': 'conectores',
    'buildings_building': 'edificios',
    'buildings_building_part': 'partes_edificio',
    'base_land_use': 'usos_suelo',
    'base_water': 'agua',
    'base_land': 'terreno',
    'places_place': 'lugares',
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


PROVENANCE = {'fuentes', 'archivo_overture', 'geojson', 'geom_valida', 'tipo_geometria', 'theme', 'type'}
TABLE_BY_KIND = {'segment': 'red_vial', 'connector': 'conector', 'building': 'edificio',
                 'building_part': 'parte_edificio', 'land_use': 'uso_suelo', 'water': 'agua',
                 'land': 'terreno', 'place': 'lugar'}


def load_rows(con, parquet):
    """Filas con geometría presente y no vacía. Atributos originales completos; la geometría va aparte."""
    if con.execute(f"SELECT count(*) FROM read_parquet('{parquet.as_posix()}')").fetchone()[0] == 0:
        return []  # conjunto vacío en el área: no hay columna espacial tipada que consultar
    cursor = con.execute(
        f"""SELECT * EXCLUDE (geometry),
                 ST_AsGeoJSON(geometry) AS geojson,
                 ST_IsValid(geometry) AS geom_valida,
                 CAST(ST_GeometryType(geometry) AS VARCHAR) AS tipo_geometria
            FROM read_parquet('{parquet.as_posix()}')
            WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
            ORDER BY id"""
    )
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def to_element(row, table):
    """Elemento para bagua_master: columnas de consulta más todos los atributos originales."""
    attributes = {k: v for k, v in row.items() if k not in PROVENANCE and k != 'id'}
    names = row.get('names') or {}
    element = {
        'id': row['id'],
        'nombre': names.get('primary') if isinstance(names, dict) else None,
        'nombres': names if isinstance(names, dict) else {},
        'clase': row.get('class'),
        'subtipo': row.get('subtype'),
        'subclase': row.get('subclass'),
        'categoria': (row.get('taxonomy') or {}).get('primary') if isinstance(row.get('taxonomy'), dict) else None,
        'atributos': attributes,
        'fuentes': row.get('sources') or [],
        'archivo_overture': row['archivo_overture'],
        'geom_valida': bool(row['geom_valida']),
        'geometria': json.loads(row['geojson']),
        'tipo_geometria': row['tipo_geometria'],
    }
    # Alturas y plantas solo cuando Overture las trae: nunca se estiman.
    if table == 'edificio':
        if row.get('height') is not None:
            element['altura_m'] = row['height']
        if row.get('num_floors') is not None:
            element['num_pisos'] = row['num_floors']
    if table != 'red_vial':
        element.pop('subclase', None)
    return element


def write_tile_layer(path, elements):
    with path.open('w', encoding='utf8', newline='\n') as stream:
        for element in elements:
            if not element['geom_valida']:
                continue  # las geometrías inválidas no se teselan para no romper el renderizado
            props = {'id': element['id'], 'nombre': element.get('nombre'), 'clase': element.get('clase'),
                     'subtipo': element.get('subtipo'), 'categoria': element.get('categoria')}
            if 'altura_m' in element:
                props['altura_m'] = element['altura_m']
            if element.get('tabla') == 'edificio':
                # Superficie geodésica de la huella (dato derivado de la geometría, no atributo de Overture):
                # permite diferenciar edificaciones en 2D sin inventar clases.
                area, _ = GEOD.geometry_area_perimeter(shape(element['geometria']))
                props['area_m2'] = round(abs(area))
            props = {k: v for k, v in props.items() if v not in (None, '')}
            stream.write(json.dumps({'type': 'Feature', 'id': element['id'], 'properties': props,
                                     'geometry': element['geometria']}, ensure_ascii=False) + '\n')


def main():
    cfg = json.loads(CONFIG.read_text(encoding='utf8'))
    release = cfg['overture']['version']
    source_dir = DATA / 'descarga' / release
    manifest_path = source_dir / 'manifest.json'
    if not manifest_path.exists():
        raise SystemExit('Falta manifest.json: ejecute overture_download.py primero.')
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    package_dir = DATA / 'paquete'
    tiles_dir = DATA / 'intermedio'
    package_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute('INSTALL spatial; LOAD spatial;')
    elements = {}
    layers_manifest = {}
    inventario = []
    for spec in cfg['temas']:
        table = TABLE_BY_KIND[spec['tipo']]
        parquet = source_dir / f"{spec['nombre']}.parquet"
        items = [to_element(r, table) for r in load_rows(con, parquet)]
        for item in items:
            item['tabla'] = table
        elements[table] = items
        inventario.append({'conjunto': spec['nombre'], 'tabla': table, 'elementos_con_geometria': len(items),
                           'invalidos': sum(1 for e in items if not e['geom_valida'])})
        tile_name = TILE_LAYERS[spec['nombre']]
        tile_path = tiles_dir / f'{tile_name}.geojsonl'
        write_tile_layer(tile_path, items)
        layers_manifest[tile_name] = {'archivo': tile_path.name, 'sha256': sha256(tile_path),
                                      'elementos': sum(1 for e in items if e['geom_valida'])}
        print(f"{spec['nombre']} -> {table}: {len(items)} con geometría", flush=True)
    package = {
        'version': 1,
        'dataset': 'bagua-master-overture-v1',
        'version_overture': release,
        'esquema_overture': cfg['overture']['esquema'],
        'atribucion': cfg['overture']['atribucion_cita'],
        'generado_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'manifiesto_sha256': sha256(manifest_path),
        'inventario': inventario,
        'tablas': elements,
    }
    raw = json.dumps(package, ensure_ascii=False, separators=(',', ':'), sort_keys=True, default=str).encode('utf8')
    package_path = package_dir / 'elementos.json.gz'
    with open(package_path, 'wb') as raw_file, gzip.GzipFile(fileobj=raw_file, mode='wb', mtime=0) as stream:
        stream.write(raw)
    summary = {
        'paquete': package_path.name,
        'paquete_sha256': sha256(package_path),
        'manifiesto_sha256': package['manifiesto_sha256'],
        'capas_teselas': layers_manifest,
        'inventario': inventario,
    }
    (package_dir / 'manifiesto.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'paquete_sha256': summary['paquete_sha256'], 'tablas': {k: len(v) for k, v in elements.items()}},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
