"""Candidatas a huellas desde la presencia de edificación de Google Open Buildings 2.5D Temporal.

Usa los recortes ya verificados por estimate_heights.py (data/bagua-master/alturas/recorte-*.tif,
bandas: altura y presencia, cuadrícula de 2 m, resolución efectiva ~4 m). Una celda es candidata si
presencia >= 0,7 y altura positiva, y NO está a menos de 3 m de ninguna huella vectorial conocida
(máscara `ocupado_vectorial.geojsonl` que escribe fusionar_edificaciones.py). Las celdas restantes se
agrupan en polígonos y solo se conservan los de 25 a 5 000 m² y compactos (sin anillos ni franjas).

Es la fuente MÁS DÉBIL de la fusión: la forma es aproximada (píxel de 2 m, suavizada a 1 m) y puede
confundir cubiertas o suelo con techos. Se publica siempre con `confianza_geo = baja` y nunca
sustituye a una huella vectorial. Licencia de los datos de origen: CC BY 4.0 (Google Research).

Requiere rasterio: se ejecuta en la imagen docker de alturas (Python con rasterio/shapely/pyproj):
  docker run --rm -v <repo>/scripts:/app/scripts:ro -v <repo>/data/bagua-master:/app/data/bagua-master \
     bagua-webgis-heights:latest python scripts/bagua-master/preparar_presencia.py
Salida: data/bagua-master/complemento/presencia_google.geojsonl
"""
import datetime
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.features import geometry_mask, shapes
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/bagua-master'
OUT = DATA / 'complemento'
PRESENCIA_MIN = 0.7
DISTANCIA_A_HUELLAS_M = 3.0
AREA_MIN, AREA_MAX = 25.0, 5000.0
COMPACIDAD_MIN = 0.6  # area / area del casco convexo
SIMPLIFICAR_M = 1.0


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    occupied = [shape(json.loads(l)) for l in (OUT / 'ocupado_vectorial.geojsonl').read_text(encoding='utf8').splitlines() if l]
    print(f'{len(occupied)} huellas conocidas como máscara', flush=True)
    results, evidence = [], []
    seen = set()
    for tif in sorted((DATA / 'alturas').glob('recorte-*.tif')):
        with rasterio.open(tif) as ds:
            to_crs = Transformer.from_crs(4326, ds.crs, always_xy=True).transform
            to_wgs = Transformer.from_crs(ds.crs, 4326, always_xy=True).transform
            height, presence = ds.read(1), ds.read(2)
            valid = (np.isfinite(height) & np.isfinite(presence) & (presence >= PRESENCIA_MIN) & (height > 0) & (height <= 100)
                     & (height != -99) & (presence != -99))
            bounds = shapely.box(*ds.bounds).buffer(DISTANCIA_A_HUELLAS_M + 5)
            near = []
            for geom in occupied:
                projected = shp_transform(to_crs, geom)
                if projected.intersects(bounds):
                    near.append(projected.buffer(DISTANCIA_A_HUELLAS_M))
            if near:
                covered = geometry_mask(near, out_shape=valid.shape, transform=ds.transform, invert=True)
                valid &= ~covered
            kept = 0
            for geom_dict, value in shapes(valid.astype('uint8'), mask=valid, transform=ds.transform):
                if value != 1:
                    continue
                poly = shape(geom_dict)
                if not (AREA_MIN <= poly.area <= AREA_MAX):
                    continue
                if poly.area / max(poly.convex_hull.area, 1e-9) < COMPACIDAD_MIN:
                    continue
                inside = geometry_mask([poly], out_shape=valid.shape, transform=ds.transform, invert=True)
                pres = float(np.mean(presence[inside]))
                alt = float(np.median(height[inside]))
                smooth = poly.simplify(SIMPLIFICAR_M, preserve_topology=True)
                if smooth.is_empty or not smooth.is_valid or smooth.geom_type != 'Polygon':
                    smooth = poly
                wgs = shp_transform(to_wgs, smooth)
                key = hashlib.sha1(shapely.to_wkt(wgs, rounding_precision=6).encode('ascii')).hexdigest()[:16]
                if key in seen:
                    continue
                seen.add(key)
                kept += 1
                results.append({
                    'type': 'Feature',
                    'properties': {'id': f'gpr:{key}', 'presencia': round(pres, 3), 'altura_m': round(alt * 2) / 2,
                                   'recorte': tif.name},
                    'geometry': json.loads(shapely.to_geojson(shapely.set_precision(wgs, 1e-7))),
                })
            evidence.append({'recorte': tif.name, 'sha256': sha256(tif), 'celdas_candidatas': int(valid.sum()),
                             'poligonos': kept})
            print(f'{tif.name}: {int(valid.sum())} celdas, {kept} polígonos', flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'presencia_google.geojsonl'
    with path.open('w', encoding='utf8', newline='\n') as stream:
        for f in sorted(results, key=lambda f: f['properties']['id']):
            stream.write(json.dumps(f, separators=(',', ':')) + '\n')
    report = {'generado_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
              'criterios': {'presencia_min': PRESENCIA_MIN, 'distancia_a_huellas_m': DISTANCIA_A_HUELLAS_M,
                            'area_m2': [AREA_MIN, AREA_MAX], 'compacidad_min': COMPACIDAD_MIN,
                            'simplificar_m': SIMPLIFICAR_M},
              'poligonos': len(results), 'recortes': evidence, 'sha256': sha256(path),
              'licencia_origen': 'CC BY 4.0 (Google Research, Open Buildings 2.5D Temporal v1, 2023)'}
    (OUT / 'presencia_google.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'poligonos': len(results)}))


if __name__ == '__main__':
    main()
