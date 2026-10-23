"""Glifos propios para las etiquetas de BAGUA MASTER (sin proveedor de estilo externo en ejecución).

Descarga una vez los glifos PBF de Noto Sans (licencia SIL OFL 1.1) generados con
maplibre/font-maker, fijados a un commit de protomaps/basemaps-assets, y los guarda en
data/bagua-master/estilo/fuentes/. El backend los sirve en /api/bagua-master/fuentes/.
Solo se descargan los rangos Unicode del español (latín, puntuación y diacríticos).

Uso: .venv-gis/Scripts/python scripts/bagua-master/fetch_glyphs.py
"""
import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/bagua-master/estilo/fuentes'
COMMIT = '83bc11ea49e5c024df51979d5953ee841fd06584'
BASE = f'https://raw.githubusercontent.com/protomaps/basemaps-assets/{COMMIT}/fonts'
FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']
RANGES = ['0-255', '256-511', '512-767', '768-1023', '7680-7935', '8192-8447', '8448-8703']


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310 (URL fija de este script)
        return response.read()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {'origen': f'protomaps/basemaps-assets@{COMMIT}', 'licencia': 'SIL Open Font License 1.1',
                'fuentes': {}}
    (OUT / 'OFL.txt').write_bytes(fetch(f'{BASE}/OFL.txt'))
    for font in FONTS:
        folder = OUT / font
        folder.mkdir(exist_ok=True)
        manifest['fuentes'][font] = {}
        for rng in RANGES:
            data = fetch(f"{BASE}/{urllib.parse.quote(font)}/{rng}.pbf")
            (folder / f'{rng}.pbf').write_bytes(data)
            manifest['fuentes'][font][rng] = hashlib.sha256(data).hexdigest()
    (OUT / 'manifiesto.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'fuentes': FONTS, 'rangos': len(RANGES), 'origen': manifest['origen']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
