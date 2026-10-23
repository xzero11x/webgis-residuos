"""Descarga reproducible del subconjunto de Overture Maps para Bagua Capital.

Consulta GeoParquet publicado en S3 (us-west-2) con DuckDB y las extensiones spatial y
httpfs. Solo se descargan los elementos cuyo bbox intersecta la ventana de descarga de
scripts/bagua-master/ambito.json. La versión está fijada: si no está disponible el proceso
se detiene y no sustituye el snapshot.

Salida (local, excluida de Git): data/bagua-master/descarga/<versión>/
  - <conjunto>.parquet          elementos con todos los atributos y su archivo de origen
  - manifest.json               procedencia, SHA-256, recuentos, validez de geometrías y licencias

Uso:
  .venv-gis/Scripts/python scripts/bagua-master/overture_download.py          (descarga y verifica)
  .venv-gis/Scripts/python scripts/bagua-master/overture_download.py --verify (solo verifica)
  .venv-gis/Scripts/python scripts/bagua-master/overture_download.py --force  (rehace la extracción)
"""
import argparse
import datetime
import hashlib
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'scripts/bagua-master/ambito.json'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def connect(region):
    con = duckdb.connect()
    con.execute(f"INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; SET s3_region='{region}';")
    extensions = con.execute(
        "SELECT extension_name, extension_version FROM duckdb_extensions() "
        "WHERE loaded AND extension_name IN ('spatial', 'httpfs') ORDER BY 1"
    ).fetchall()
    return con, {name: version for name, version in extensions}


def bbox_predicate(box):
    xmin, ymin, xmax, ymax = box
    # Intersección: un elemento que cruza el borde de la ventana se conserva completo.
    return (f"bbox.xmax >= {xmin} AND bbox.xmin <= {xmax} "
            f"AND bbox.ymax >= {ymin} AND bbox.ymin <= {ymax}")


def extract(con, cfg, spec, target):
    glob = f"{cfg['overture']['s3']}/theme={spec['tema']}/type={spec['tipo']}/*"
    tmp = target.with_suffix('.parquet.tmp')
    con.execute(
        f"""COPY (
              SELECT *, filename AS archivo_overture
              FROM read_parquet('{glob}', filename=true, hive_partitioning=1)
              WHERE {bbox_predicate(cfg['ambito']['descarga_bbox'])}
            ) TO '{tmp.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)"""
    )
    tmp.replace(target)


def validate(con, path):
    # El GeoParquet declara la columna como GEOMETRY('OGC:CRS84'): no requiere conversión.
    p = f"read_parquet('{path.as_posix()}')"
    if con.execute(f"SELECT count(*) FROM {p}").fetchone()[0] == 0:
        # Sin filas, DuckDB no escribe el tipo espacial: el conjunto está vacío en el área (ausencia real).
        return {'filas': 0, 'ids_unicos': 0, 'geometria_nula': 0, 'geometria_vacia': 0,
                'geometria_invalida': 0, 'tipos_geometria': {}, 'fuentes_primarias': []}
    base = con.execute(
        f"""SELECT count(*),
              count(DISTINCT id),
              count(*) FILTER (WHERE geometry IS NULL),
              count(*) FILTER (WHERE geometry IS NOT NULL AND ST_IsEmpty(geometry)),
              count(*) FILTER (WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry) AND NOT ST_IsValid(geometry))
            FROM {p}"""
    ).fetchone()
    types = dict(con.execute(
        f"SELECT CAST(ST_GeometryType(geometry) AS VARCHAR), count(*) FROM {p} GROUP BY 1 ORDER BY 1"
    ).fetchall())
    licenses = con.execute(
        f"""SELECT sources[1].dataset, sources[1].license, count(*)
            FROM {p} GROUP BY 1, 2 ORDER BY 3 DESC"""
    ).fetchall()
    return {
        'filas': base[0],
        'ids_unicos': base[1],
        'geometria_nula': base[2],
        'geometria_vacia': base[3],
        'geometria_invalida': base[4],
        'tipos_geometria': {k: v for k, v in types.items() if k is not None},
        'fuentes_primarias': [{'dataset': d, 'licencia': l, 'elementos': n} for d, l, n in licenses],
    }


def load_manifest(directory):
    manifest_path = directory / 'manifest.json'
    if manifest_path.exists():
        return json.loads(manifest_path.read_text(encoding='utf8'))
    return None


def run(force, verify_only):
    cfg = json.loads(CONFIG.read_text(encoding='utf8'))
    release = cfg['overture']['version']
    directory = ROOT / 'data/bagua-master/descarga' / release
    directory.mkdir(parents=True, exist_ok=True)
    previous = load_manifest(directory)
    previous_sets = {c['nombre']: c for c in (previous or {}).get('conjuntos', [])}
    con, versions = connect(cfg['overture']['region_s3'])
    conjuntos = []
    for spec in cfg['temas']:
        target = directory / f"{spec['nombre']}.parquet"
        if not verify_only and (force or not target.exists()):
            print(f"Extrayendo {spec['nombre']} ...", flush=True)
            try:
                extract(con, cfg, spec, target)
            except duckdb.Error as error:
                raise SystemExit(
                    f"Overture {release} no disponible o no legible para {spec['nombre']}: {error}. "
                    "No se sustituye el snapshot por otro."
                )
        if not target.exists():
            raise SystemExit(f"Falta {target.name}: ejecute sin --verify.")
        stats = validate(con, target)
        digest = sha256(target)
        before = previous_sets.get(spec['nombre'])
        conjuntos.append({
            'nombre': spec['nombre'], 'tema': spec['tema'], 'tipo': spec['tipo'],
            'archivo': target.name, 'bytes': target.stat().st_size, 'sha256': digest,
            'sha256_previo_coincide': (before or {}).get('sha256') == digest if before else None,
            **stats,
        })
        print(f"  {spec['nombre']}: {stats['filas']} elementos, nulos {stats['geometria_nula']}, "
              f"vacíos {stats['geometria_vacia']}, inválidos {stats['geometria_invalida']}", flush=True)
    manifest = {
        'modulo': 'BAGUA MASTER',
        'version_overture': release,
        'esquema_overture': cfg['overture']['esquema'],
        'atribucion': cfg['overture']['atribucion_cita'],
        'extraccion_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'duckdb': duckdb.__version__,
        'extensiones': versions,
        'descarga_bbox': cfg['ambito']['descarga_bbox'],
        'ventana_urbana': cfg['ambito']['ventana_urbana'],
        'referencia_administrativa': cfg['referencia_administrativa'],
        'conjuntos': conjuntos,
    }
    if not verify_only:
        manifest_path = directory / 'manifest.json'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'version': release, 'conjuntos': len(conjuntos),
                      'elementos': sum(c['filas'] for c in conjuntos)}, ensure_ascii=False))
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    run(force=args.force, verify_only=args.verify)
    sys.exit(0)
