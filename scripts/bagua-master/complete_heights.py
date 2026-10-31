"""Completa alturas visuales con simulación reproducible, sin reemplazar datos externos.

La semilla por id evita que cambie la ciudad al recargar. Google condiciona la
distribución local; GHSL ANBH 2018 es contexto de barrio, no altura individual.
"""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
from pyproj import Transformer
import rasterio
from shapely.geometry import Point, box, shape
from shapely.strtree import STRtree

from estimate_heights import ROOT, sql

METHOD = 'vecindario-satelital-ghsl-semilla-id-v2'
DIRECTORY = ROOT / 'data/bagua-master/alturas/fuentes-adicionales'
GHSL_URL = 'https://jrc-ghsl.s3.eu-central-1.amazonaws.com/ghs-built-h-anbh/r2023a/4326/3asec/2018/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0.tif'


def seed(identifier):
    return int.from_bytes(hashlib.sha256((METHOD + '|' + identifier).encode()).digest()[:8], 'big')


def simulate(identifier, xy, area, aspect, donors, ghsl):
    """Plausibilidad visual por vecindario; ninguna salida es una medición."""
    rng = np.random.default_rng(seed(identifier))
    values = np.array(donors, dtype=float)
    values = values[np.isfinite(values) & (values > 0) & (values <= 100)]
    reference = float(np.median(values)) if len(values) else (ghsl or 5.5)
    if ghsl is not None:
        reference = 0.85 * reference + 0.15 * np.clip(ghsl, 2.7, 15)
    spread = float(np.std(np.log(values))) if len(values) >= 4 else 0.22
    spread = float(np.clip(spread, 0.15, 0.35))
    # Perturbación compartida por celda de 150 m: coherencia de barrio sin alturas idénticas.
    cell = f'{math.floor(xy[0]/150)}:{math.floor(xy[1]/150)}'
    block = np.random.default_rng(seed(cell)).normal(0, 0.07)
    drawn = float(np.exp(np.log(reference) + block + rng.normal(0, spread)))
    levels = int(np.clip(round(drawn / 3.0), 1, 5))
    height = 3.0 * levels + 0.25 + rng.uniform(-0.2, 0.2)
    # Priors visuales para huellas muy pequeñas o muy alargadas; no asignan un uso real.
    if area < 25:
        height = min(height, 3.5)
    if area > 400 and aspect > 4:
        height = min(height, 9.5)
    return round(float(np.clip(height, 2.7, 18)), 1), round(reference, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--importar', action='store_true')
    args = parser.parse_args()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    raw = sql("""SELECT json_build_object('id',e.id,'geometry',ST_AsGeoJSON(e.geom)::json,
      'original',e.altura_m,'estimada',a.altura_m) FROM bagua_master.edificio e
      LEFT JOIN bagua_master.altura_estimada a ON a.edificio_id=e.id WHERE e.geom_valida ORDER BY e.id;""")
    records = [json.loads(line) for line in raw.splitlines()]
    project = Transformer.from_crs(4326,32717,always_xy=True)
    from shapely import transform
    for r in records:
        r['geom'] = transform(shape(r['geometry']), project.transform, interleaved=False)
        r['point'] = r['geom'].centroid
        r['area'] = r['geom'].area
    donors = [r for r in records if (r['original'] or r['estimada']) is not None]
    if not donors:
        raise RuntimeError('No existen alturas externas para calibrar el modelo.')
    points = [r['point'] for r in donors]
    tree = STRtree(points)
    ghsl_file = DIRECTORY / 'ghsl-bagua-2018.tif'
    if not ghsl_file.exists():
        from rasterio.windows import from_bounds
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='90'):
            with rasterio.open(GHSL_URL) as ds:
                w=from_bounds(-78.585,-5.70,-78.48,-5.59,ds.transform).round_offsets().round_lengths()
                arr=ds.read(1,window=w);profile=ds.profile.copy()
                profile.update(width=int(w.width),height=int(w.height),transform=ds.window_transform(w),compress='deflate')
                with rasterio.open(ghsl_file,'w',**profile) as out:out.write(arr,1)
    output = io.StringIO();writer = csv.writer(output,lineterminator='\n');values=[]
    with rasterio.open(ghsl_file) as ghsl:
        for r in records:
            if r['original'] is not None or r['estimada'] is not None:
                continue
            x,y=r['point'].x,r['point'].y
            candidates = list(tree.query(box(x-350,y-350,x+350,y+350)))
            candidates = [i for i in candidates if r['point'].distance(points[i]) <= 350
                          and 0.35 <= donors[i]['area']/max(r['area'],1) <= 3]
            candidates.sort(key=lambda i:r['point'].distance(points[i]))
            candidates = candidates[:40]
            # Sin muestra local suficiente, usar distribución global de huellas comparables.
            pool = [donors[i]['original'] or donors[i]['estimada'] for i in candidates]
            if len(pool) < 5:
                pool = [d['original'] or d['estimada'] for d in donors
                        if 0.35 <= d['area']/max(r['area'],1) <= 3]
            lon,lat=shape(r['geometry']).centroid.coords[0]
            contextual=float(next(ghsl.sample([(lon,lat)]))[0])
            if not np.isfinite(contextual) or contextual <= 0 or contextual > 100:
                contextual=None
            bounds=r['geom'].bounds;w,h=bounds[2]-bounds[0],bounds[3]-bounds[1]
            aspect=max(w,h)/max(min(w,h),0.1)
            height,reference=simulate(r['id'],(x,y),r['area'],aspect,pool,contextual)
            writer.writerow([r['id'],height,METHOD,str(seed(r['id'])),len(candidates),reference,contextual])
            values.append(height)
    if args.importar:
        sql("BEGIN; CREATE TEMP TABLE simuladas_importadas (LIKE bagua_master.altura_simulada INCLUDING DEFAULTS);\n"
            "COPY simuladas_importadas(edificio_id,altura_m,metodo,semilla,vecinos,referencia_m,ghsl_m) FROM STDIN WITH (FORMAT csv);\n"+
            output.getvalue()+"\\.\nDELETE FROM bagua_master.altura_simulada;\n"
            "INSERT INTO bagua_master.altura_simulada SELECT * FROM simuladas_importadas; COMMIT;\n")
    (DIRECTORY/'simuladas.csv').write_text(output.getvalue())
    report={'metodo':METHOD,'satelitales':len(donors),'simuladas':len(values),'total':len(records),
            'percentiles_simuladas_m':np.percentile(values,[0,10,50,90,100]).tolist() if values else [],
            'ghsl':GHSL_URL,'semilla':'SHA256(version|id), primeros 64 bits',
            'aviso':'Alturas SIMULADAS para completar visualmente. No son observaciones, pisos reales ni catastro.'}
    (DIRECTORY/'simulacion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
