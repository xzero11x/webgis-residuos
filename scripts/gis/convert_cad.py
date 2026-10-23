"""Convert read-only municipal sources. Record repair retries and preserve failed outputs."""
from pathlib import Path
from sources import SOURCE_DIR
import hashlib
import json
import shutil
import ezdxf
from ezdxf.addons import odafc

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/cad/converted'
OUT.mkdir(parents=True, exist_ok=True)
executables = list(Path('C:/Program Files/ODA').glob('**/ODAFileConverter.exe'))
if not executables:
    raise SystemExit('Install ODA.ODAFileConverter or set its path in ezdxf config.')
ezdxf.options.set('odafc-addon', 'win_exec_path', str(sorted(executables)[-1]))
log = []
previous = {r['source']:r for r in json.loads((OUT/'conversion-log.json').read_text(encoding='utf8'))} if (OUT/'conversion-log.json').exists() else {}
for source in sorted(SOURCE_DIR.iterdir()):
    if source.suffix.lower() not in ('.dwg', '.bak'):
        continue
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    dest = OUT / f'{source.name}.dxf'
    print(f'Converting {source.name}', flush=True)
    repaired = False
    cache = previous.get(source.name,{})
    valid_cache = (dest.exists() and cache.get('source_sha256')==digest
                   and hashlib.sha256(dest.read_bytes()).hexdigest()==cache.get('dxf_sha256')
                   and dest.read_bytes().rstrip().endswith(b'EOF'))
    if valid_cache: repaired = bool(cache.get('audit_repair'))
    if not valid_cache:
        # Work on copies: ODA receives no original municipal path.
        working = OUT / 'input' / (source.name + '.dwg')
        working.parent.mkdir(exist_ok=True)
        shutil.copy2(source, working)
        if dest.exists():
            shutil.copy2(dest, dest.with_name(dest.name+'.previous-'+hashlib.sha256(dest.read_bytes()).hexdigest()[:12]))
        odafc.convert(working, dest, version='R2018', audit=False, replace=dest.exists())
        if not dest.read_bytes().rstrip().endswith(b'EOF'):
            shutil.copy2(dest, dest.with_suffix('.partial-dxf'))
            odafc.convert(working, dest, version='R2018', audit=True, replace=True)
            repaired = True
    doc = ezdxf.readfile(dest)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    log.append({'source': source.name, 'source_sha256': digest, 'dxf': dest.name, 'dxf_sha256': hashlib.sha256(dest.read_bytes()).hexdigest(), 'audit_repair': repaired, 'modelspace_entities': len(doc.modelspace()), 'note': 'Repair applied only to working copy after truncated export; original untouched. Compare resulting geometry with PDF.' if repaired else 'Export without audit/repair.'})
    print(f'OK {dest.stat().st_size} bytes', flush=True)
(OUT / 'conversion-log.json').write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding='utf8')
