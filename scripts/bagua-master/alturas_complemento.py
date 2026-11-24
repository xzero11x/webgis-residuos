"""Alturas de las huellas complementarias con Google Open Buildings 2.5D Temporal (2023).

Reutiliza `estimate()` de estimate_heights.py (mismos umbrales: presencia >= 0,7, al menos cuatro
muestras y 50 % de cobertura válida; mediana redondeada a 0,5 m) sobre los recortes ya verificados
en data/bagua-master/alturas/. Las huellas sin respaldo suficiente NO reciben una altura inventada
aquí: el importador les asigna 3,0 m con origen `estimada_default`, claramente distinguible, que
deberá sobrescribir el DSM del dron (`origen_altura = 'dron_dsm'`).

Se ejecuta en la imagen docker de alturas:
  docker run --rm -v <repo>/scripts:/app/scripts:ro -v <repo>/data/bagua-master:/app/data/bagua-master \
     bagua-webgis-heights:latest python scripts/bagua-master/alturas_complemento.py
Salida: data/bagua-master/complemento/alturas_complemento.csv  (id, altura_m, cobertura, muestras)
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

import rasterio
from pyproj import Transformer
from shapely import transform as transform_coordinates
from shapely.geometry import box, shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from estimate_heights import estimate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/bagua-master'
OUT = DATA / 'complemento'


def main():
    features = [json.loads(l) for l in (OUT / 'edificios_complemento.geojsonl').read_text(encoding='utf8').splitlines() if l]
    buildings = [(f['properties']['id'], shape(f['geometry'])) for f in features]
    best = {}
    evidence = []
    for tif in sorted((DATA / 'alturas').glob('recorte-*.tif')):
        with rasterio.open(tif) as crop:
            project = Transformer.from_crs(4326, crop.crs, always_xy=True).transform
            projected = [(i, transform_coordinates(g, project, interleaved=False)) for i, g in buildings]
            relevant = [(i, g) for i, g in projected if box(*crop.bounds).covers(g)]
            arrays = crop.read()
            found = estimate(relevant, arrays[0], arrays[1], crop.transform)
        for identifier, values in found.items():
            if identifier not in best or (values[1], values[2]) > (best[identifier][1], best[identifier][2]):
                best[identifier] = values
        evidence.append({'recorte': tif.name, 'huellas_dentro': len(relevant), 'con_altura': len(found)})
        print(f'{tif.name}: {len(relevant)} huellas dentro, {len(found)} con altura', flush=True)
    path = OUT / 'alturas_complemento.csv'
    with path.open('w', encoding='utf8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        for identifier, (height, coverage, count) in sorted(best.items()):
            writer.writerow([identifier, height, coverage, count])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (OUT / 'alturas_complemento.json').write_text(json.dumps({
        'huellas': len(buildings), 'con_altura_satelital': len(best), 'sin_altura': len(buildings) - len(best),
        'metodo': 'mediana-cuadricula-2m-presencia-0.7-cobertura-0.5-v1', 'recortes': evidence, 'sha256': digest,
    }, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'huellas': len(buildings), 'con_altura_satelital': len(best)}))


if __name__ == '__main__':
    main()
