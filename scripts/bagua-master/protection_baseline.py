"""Referencia verificable del estado protegido antes y después de BAGUA MASTER.

Registra SHA-256 de los originales municipales y de los paquetes derivados, y el estado
de las tablas municipales en PostGIS (recuentos y huellas). El modo --verify compara
el estado actual con la referencia y falla si algo protegido cambió.

Uso:
  .venv-gis/Scripts/python scripts/bagua-master/protection_baseline.py --write
  .venv-gis/Scripts/python scripts/bagua-master/protection_baseline.py --verify
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / 'data/bagua-master/proteccion/referencia.json'

# Originales (solo lectura), paquetes derivados y migraciones históricas.
PROTECTED_GLOBS = [
    'rutas/**/*',
    'rustas/**/*',
    'database/municipal/*.json',
    'database/municipal/*.gz',
    'database/migrations/*.sql',
    'data/cad/gis/*.geojson',
    'data/cad/gis/*.gz',
    'data/cad/gis/segunda-pasada/*',
    'data/cad/extracted/tercera/matriz/*',
    'data/cad/extracted/tercera/complementos/*',
    'data/cad/extracted/tercera/versiones/*',
    'data/cad/extracted/tercera/pendientes/*',
]

SQL = {
    'rutas': 'SELECT count(*) FROM rutas',
    'rutas_huella': "SELECT md5(string_agg(id||codigo||coalesce(color,'')||ST_AsText(geom),'|' ORDER BY id)) FROM rutas",
    'predios': 'SELECT count(*) FROM predios',
    'puntos_recoleccion': 'SELECT count(*) FROM puntos_recoleccion',
    'cad_features': 'SELECT count(*) FROM cad_features',
    'cad_features_huella': "SELECT md5(string_agg(key,'|' ORDER BY key)) FROM cad_features",
    'cad_review': 'SELECT count(*) FROM cad_review',
    'cad_second_pass': 'SELECT count(*) FROM cad_second_pass',
    'municipal_cartography': 'SELECT count(*) FROM municipal_cartography',
    'territorio_entidad': 'SELECT count(*) FROM territorio_entidad',
    'territorio_representacion': 'SELECT count(*) FROM territorio_representacion',
    'schema_migrations': 'SELECT string_agg(name,\',\' ORDER BY name) FROM schema_migrations',
    'municipal_imports': 'SELECT string_agg(dataset||\':\'||checksum,\',\' ORDER BY dataset) FROM municipal_imports',
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def files():
    found = set()
    for pattern in PROTECTED_GLOBS:
        for path in ROOT.glob(pattern):
            if path.is_file():
                found.add(path)
    return sorted(found)


def database_state():
    state = {}
    for name, sql in SQL.items():
        result = subprocess.run(
            ['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
             f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "{sql}"'],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        if result.returncode != 0:
            raise SystemExit(f'No se pudo consultar {name}: {result.stderr.strip()}')
        state[name] = result.stdout.strip()
    return state


def snapshot():
    hashes = {str(p.relative_to(ROOT)).replace('\\', '/'): sha256(p) for p in files()}
    return {'archivos': hashes, 'base_de_datos': database_state()}


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    current = snapshot()
    if args.write:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding='utf8')
        print(f"Referencia escrita: {len(current['archivos'])} archivos protegidos, "
              f"{len(current['base_de_datos'])} consultas de base de datos.")
        return
    reference = json.loads(BASELINE.read_text(encoding='utf8'))
    changed = [k for k in reference['archivos'] if current['archivos'].get(k) != reference['archivos'][k]]
    missing = [k for k in reference['archivos'] if k not in current['archivos']]
    added = [k for k in current['archivos'] if k not in reference['archivos']]
    db_changed = [k for k in reference['base_de_datos'] if current['base_de_datos'].get(k) != reference['base_de_datos'][k]]
    report = {'archivos_verificados': len(reference['archivos']), 'modificados': changed,
              'desaparecidos': missing, 'nuevos': added, 'base_de_datos_modificada': db_changed}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if changed or missing or db_changed:
        sys.exit(1)
    print('Sin cambios en los elementos protegidos.')


if __name__ == '__main__':
    main()
