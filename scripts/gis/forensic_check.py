"""Integrity control for the third pass.

  python scripts/gis/forensic_check.py --baseline   # before extracting
  python scripts/gis/forensic_check.py --verify     # after: nothing protected changed

Protected: originals (rutas/ and the BAK working copies), first/second-pass
extractions, derived GIS packages and the PostGIS row counts (read-only query).
--verify also checks that publishable third-pass outputs carry no private fields.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
from sources import ROOT, SOURCE_DIR

OUT = ROOT / 'data/cad/extracted/tercera'
BASELINE = OUT / 'linea-base.json'
PROTECTED = [SOURCE_DIR, ROOT / 'data/cad/converted', ROOT / 'data/cad/gis', ROOT / 'database/municipal']
EXTRACTED = ROOT / 'data/cad/extracted'
TABLES = ['predios', 'rutas', 'servicios', 'puntos_recoleccion', 'cad_features', 'municipal_cartography',
          'cad_second_pass', 'cad_review', 'municipal_imports']
PRIVATE_KEYS = ('author', 'last_saved_by', 'full_name', 'found_path', 'custom_properties')


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def files():
    out = []
    for base in PROTECTED:
        out += [p for p in base.rglob('*') if p.is_file()]
    out += [p for p in EXTRACTED.rglob('*') if p.is_file() and OUT not in p.parents]
    return sorted(out)


def table_counts():
    sql = ' UNION ALL '.join(f"SELECT '{t}', (SELECT count(*) FROM {t})::text" for t in TABLES)
    try:
        res = subprocess.run(['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
                              f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtF"|" -c "{sql}"'],
                             cwd=ROOT, capture_output=True, text=True, timeout=120)
        if res.returncode:
            return {'error': res.stderr.strip()[:300]}
        return dict(line.split('|', 1) for line in res.stdout.split() if '|' in line)
    except (OSError, subprocess.TimeoutExpired) as ex:
        return {'error': str(ex)}


def snapshot():
    return {'files': {p.relative_to(ROOT).as_posix(): sha(p) for p in files()}, 'postgis': table_counts()}


def private_leaks():
    """Publishable outputs must not contain the private keys or local user paths."""
    leaks = []
    for p in [*OUT.rglob('*.json'), *OUT.rglob('*.geojson')]:
        if 'privado' in p.parts or p.name == BASELINE.name:
            continue
        text = p.read_text(encoding='utf8', errors='replace')
        for key in PRIVATE_KEYS:
            if f'"{key}"' in text:
                leaks.append(f'{p.relative_to(ROOT).as_posix()}: clave {key}')
        if 'C:\\\\Users\\\\' in text or 'C:/Users/' in text:
            leaks.append(f'{p.relative_to(ROOT).as_posix()}: ruta de usuario')
    return leaks


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    if '--baseline' in sys.argv:
        snap = snapshot()
        BASELINE.write_text(json.dumps(snap, indent=1), encoding='utf8')
        print(f"Línea base: {len(snap['files'])} archivos protegidos; PostGIS {snap['postgis']}")
    elif '--verify' in sys.argv:
        base = json.loads(BASELINE.read_text(encoding='utf8'))
        now = snapshot()
        changed = [f for f, h in base['files'].items() if now['files'].get(f) != h]
        added = sorted(set(now['files']) - set(base['files']))
        db_changed = {t: (base['postgis'].get(t), now['postgis'].get(t)) for t in TABLES
                      if base['postgis'].get(t) != now['postgis'].get(t)}
        leaks = private_leaks()
        result = {'protected_files': len(base['files']), 'changed_or_missing': changed, 'new_protected_files': added,
                  'postgis_changes': db_changed, 'private_leaks': leaks,
                  'ok': not changed and not db_changed and not leaks}
        (OUT / 'verificacion.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result['ok'] else 1)
    else:
        print(__doc__)
