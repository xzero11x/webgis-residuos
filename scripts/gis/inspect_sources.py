"""Read-only source inventory and PDF extraction. Run with the GIS virtualenv."""
from pathlib import Path
from sources import SOURCE_DIR
import hashlib
import json
import pymupdf
import pyogrio

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/cad/extracted'
OUT.mkdir(parents=True, exist_ok=True)
inventory = []
for source in sorted(SOURCE_DIR.iterdir()):
    if not source.is_file():
        continue
    raw = source.read_bytes()
    item = {'name': source.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'signature': raw[:6].decode('ascii', errors='replace')}
    if source.suffix.lower() == '.pdf':
        doc = pymupdf.open(source)
        item['metadata'] = doc.metadata
        item['pages'] = []
        for i, page in enumerate(doc):
            prefix = OUT / f'{source.stem}-p{i+1}'
            prefix.with_suffix('.txt').write_text(page.get_text(sort=False), encoding='utf8')
            prefix.with_suffix('.json').write_text(json.dumps(page.get_text('dict', flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES), ensure_ascii=False), encoding='utf8')
            page.get_pixmap(matrix=pymupdf.Matrix(0.7, 0.7), alpha=False).save(str(prefix)+'.png')
            item['pages'].append({'number': i+1, 'width': page.rect.width, 'height': page.rect.height, 'vector_paths': len(page.get_drawings()), 'images': len(page.get_images())})
    inventory.append(item)
(OUT / 'source-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'files':inventory, 'gdal_version':pyogrio.__gdal_version__, 'cad_drivers': {k:v for k,v in pyogrio.list_drivers().items() if k in ('DWG','CAD','DXF')}}, ensure_ascii=False, indent=2))
