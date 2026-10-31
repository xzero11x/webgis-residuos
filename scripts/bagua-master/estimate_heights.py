"""Cruza Google Open Buildings Temporal 2023 con las huellas originales de Overture.

Solo publica estimaciones con >=50% de píxeles interiores válidos y >=4 muestras
sobre una cuadrícula de 2 m. Presencia >=0,7 es un filtro, no una probabilidad.
No modifica huellas ni atributos originales. Requiere la migración 013.
"""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

import numpy as np
from pyproj import Transformer
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import Affine
from rasterio.windows import Window, from_bounds
import s2sphere as s2
from shapely.geometry import box, mapping, shape
from shapely import transform as transform_coordinates

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/bagua-master/alturas'
SOURCE = 'Google Open Buildings 2.5D Temporal v1'
DATE = '2023-06-30'
METHOD = 'mediana-cuadricula-2m-presencia-0.7-cobertura-0.5-v1'
BUCKET = 'open-buildings-temporal-data'


def transform(fn, geometry):
    return transform_coordinates(geometry, fn, interleaved=False)


def sql(query):
    result = subprocess.run(
        ['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
         'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        cwd=ROOT, input=query, text=True, capture_output=True, check=True)
    return result.stdout


def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return json.load(response)


def discover(bounds):
    rect = s2.LatLngRect.from_point_pair(
        s2.LatLng.from_degrees(bounds[1], bounds[0]),
        s2.LatLng.from_degrees(bounds[3], bounds[2]))
    cover = s2.RegionCoverer()
    cover.min_level = cover.max_level = 2
    tiles = []
    for cell in cover.get_covering(rect):
        prefix = f'v1/manifests/{cell.to_token()}_'
        url = f'https://storage.googleapis.com/storage/v1/b/{BUCKET}/o?' + urllib.parse.urlencode(
            {'prefix': prefix, 'maxResults': 1000})
        listing = fetch(url)
        for obj in listing.get('items', []):
            if '_2023_' not in obj['name']:
                continue
            cache = OUT / Path(obj['name']).name
            if not cache.exists():
                cache.write_text(json.dumps(fetch(f'https://storage.googleapis.com/{BUCKET}/' + obj['name'])))
            manifest = json.loads(cache.read_text())
            for tileset in manifest['tilesets']:
                projection = tileset['crs']
                roi = transform(Transformer.from_crs(4326, projection, always_xy=True).transform, box(*bounds))
                for item in tileset['sources']:
                    a, size = item['affineTransform'], item['dimensions']
                    x, y = a['translateX'], a['translateY']
                    x2, y2 = x + a['scaleX'] * size['width'], y + a['scaleY'] * size['height']
                    if box(min(x, x2), min(y, y2), max(x, x2), max(y, y2)).intersects(roi):
                        uri = manifest['uriPrefix'] + item['uris'][0]
                        tiles.append(uri.replace('gs://', 'https://storage.googleapis.com/'))
    return sorted(set(tiles))


def estimate(geometries, heights, presence, affine):
    """Mediana sin valores por defecto; no publica polígonos con respaldo insuficiente."""
    candidates = {}
    h, w = heights.shape
    for identifier, geom in geometries:
        if not box(*rasterio.transform.array_bounds(h, w, affine)).covers(geom):
            continue
        win = from_bounds(*geom.bounds, affine)
        col, row = max(0, math.floor(win.col_off)), max(0, math.floor(win.row_off))
        right, bottom = min(w, math.ceil(win.col_off + win.width)), min(h, math.ceil(win.row_off + win.height))
        if right <= col or bottom <= row:
            continue
        cut = (slice(row, bottom), slice(col, right))
        inside = geometry_mask([mapping(geom)], out_shape=(bottom-row, right-col),
                               transform=affine @ Affine.translation(col, row), invert=True)
        total = int(inside.sum())
        if total == 0:
            continue
        values, confidence = heights[cut], presence[cut]
        valid = (inside & np.isfinite(values) & np.isfinite(confidence) &
                 (values > 0) & (values <= 100) & (confidence >= 0.7))
        count = int(valid.sum())
        coverage = count / total
        if count < 4 or coverage < 0.5:
            continue
        # Redondeo a 0,5 m; no implica precisión de 0,5 m.
        height = max(0.5, round(float(np.median(values[valid])) * 2) / 2)
        candidates[identifier] = (height, round(coverage, 4), count)
    return candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--importar', action='store_true', help='Publica resultados de forma transaccional en PostGIS')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    raw = sql("SELECT json_build_object('id',id,'geometry',ST_AsGeoJSON(geom)::json) FROM bagua_master.edificio WHERE geom_valida ORDER BY id;")
    buildings = [(item['id'], shape(item['geometry'])) for item in map(json.loads, raw.splitlines())]
    bounds = (min(g.bounds[0] for _, g in buildings), min(g.bounds[1] for _, g in buildings),
              max(g.bounds[2] for _, g in buildings), max(g.bounds[3] for _, g in buildings))
    urls = discover(bounds)
    (OUT / 'teselas.json').write_text(json.dumps(urls, indent=2))
    print(f'{len(buildings)} edificios; {len(urls)} teselas candidatas', flush=True)
    results = {}
    evidence = []
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
                      GDAL_HTTP_CONNECTTIMEOUT='20', GDAL_HTTP_TIMEOUT='120', GDAL_HTTP_MAX_RETRY='2'):
        for index, url in enumerate(urls):
            cache = OUT / f'recorte-{hashlib.sha256(url.encode()).hexdigest()[:12]}.tif'
            with rasterio.open(url) as ds:
                project = Transformer.from_crs(4326, ds.crs, always_xy=True).transform
                projected = [(identifier, transform(project, geom)) for identifier, geom in buildings]
                relevant = [(identifier, geom) for identifier, geom in projected if box(*ds.bounds).covers(geom)]
                if not relevant:
                    continue
                if not cache.exists():
                    bbox = (min(g.bounds[0] for _, g in relevant)-4, min(g.bounds[1] for _, g in relevant)-4,
                            max(g.bounds[2] for _, g in relevant)+4, max(g.bounds[3] for _, g in relevant)+4)
                    win = from_bounds(*bbox, ds.transform).round_offsets().round_lengths().intersection(Window(0,0,ds.width,ds.height))
                    width, height = math.ceil(win.width * ds.res[0] / 2), math.ceil(win.height * ds.res[1] / 2)
                    print(f'Leyendo {index+1}/{len(urls)}: {len(relevant)} huellas, cuadrícula {width}×{height}', flush=True)
                    arrays = ds.read([2, 3], window=win, out_shape=(2,height,width), resampling=Resampling.average, masked=True)
                    affine = ds.window_transform(win) @ Affine.scale(win.width/width,win.height/height)
                    profile = dict(driver='GTiff',width=width,height=height,count=2,dtype='float32',
                                   crs=ds.crs,transform=affine,nodata=-99,compress='deflate',tiled=True)
                    temporary = cache.with_suffix('.tmp.tif')
                    with rasterio.open(temporary,'w',**profile) as dst:
                        dst.write(arrays.filled(-99))
                        dst.set_band_description(1,'building_height'); dst.set_band_description(2,'building_presence')
                    temporary.replace(cache)
            with rasterio.open(cache) as crop:
                arrays = crop.read()
                candidates = estimate(relevant, arrays[0], arrays[1], crop.transform)
            for identifier, values in candidates.items():
                # Teselas solapadas: preferir cobertura válida y después muestras; no duplicar huellas.
                if identifier not in results or (values[1],values[2]) > (results[identifier][1],results[identifier][2]):
                    results[identifier] = (*values,url)
            evidence.append({'url':url,'sha256_recorte':hashlib.sha256(cache.read_bytes()).hexdigest(),
                             'candidatos':len(candidates),'huellas':len(relevant)})
            print(f'Acumulado: {len(results)} alturas con respaldo suficiente',flush=True)
    if not results:
        raise RuntimeError('No hay resultados válidos; no se modifica PostGIS.')
    csv_output = io.StringIO()
    writer = csv.writer(csv_output,lineterminator='\n')
    for identifier, (height,coverage,count,url) in sorted(results.items()):
        writer.writerow([identifier,height,coverage,count,SOURCE,DATE,METHOD,url])
    (OUT/'alturas.csv').write_text(csv_output.getvalue())
    heights = [v[0] for v in results.values()]
    report = {'fuente':SOURCE,'fecha':DATE,'licencia':'CC BY 4.0','metodo':METHOD,
              'resolucion_efectiva_m':4,'cuadricula_m':2,'umbral_presencia':0.7,
              'cobertura_minima':0.5,'muestras_minimas':4,'edificios':len(buildings),
              'con_altura':len(results),'sin_altura':len(buildings)-len(results),
              'percentiles_altura_m':np.percentile(heights,[10,50,90]).tolist(),
              'huellas_sha256':hashlib.sha256(raw.encode()).hexdigest(),'teselas':evidence,
              'aviso':'Alturas satelitales estimadas de 2023; alineación y precisión local no verificadas en campo. No equivalen a pisos ni datos catastrales.'}
    (OUT/'manifiesto.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    if args.importar:
        sql("BEGIN; CREATE TEMP TABLE alturas_importadas (LIKE bagua_master.altura_estimada INCLUDING DEFAULTS);\n"
            "COPY alturas_importadas(edificio_id,altura_m,cobertura,muestras,fuente,fecha,metodo,tesela) FROM STDIN WITH (FORMAT csv);\n"+
            csv_output.getvalue()+"\\.\nDELETE FROM bagua_master.altura_estimada WHERE fuente='Google Open Buildings 2.5D Temporal v1' OR edificio_id IN (SELECT edificio_id FROM alturas_importadas);\n"
            "INSERT INTO bagua_master.altura_estimada SELECT * FROM alturas_importadas; COMMIT;\n")
        print('Importación transaccional terminada.',flush=True)
    print(json.dumps({k:v for k,v in report.items() if k!='teselas'},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
