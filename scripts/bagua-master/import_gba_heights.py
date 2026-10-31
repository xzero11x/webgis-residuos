"""Incorpora GBA.Height 2019 en huellas sin altura de Google, sin sustituir geometrías."""
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
from rasterio.windows import from_bounds, Window
from shapely import transform
from shapely.geometry import box, shape

from estimate_heights import ROOT, estimate, sql

DIRECTORY=ROOT/'data/bagua-master/alturas/fuentes-adicionales'
SOURCE='GlobalBuildingAtlas (TUM)'
METHOD='mediana-nativa-3m-altura-2a100-cobertura-0.5-min4-v1'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--importar',action='store_true')
    args=parser.parse_args()
    raw=sql("""SELECT json_build_object('id',e.id,'geometry',ST_AsGeoJSON(e.geom)::json)
      FROM bagua_master.edificio e LEFT JOIN bagua_master.altura_estimada a ON a.edificio_id=e.id
      WHERE e.geom_valida AND e.altura_m IS NULL AND (a.edificio_id IS NULL OR a.fuente='GlobalBuildingAtlas (TUM)') ORDER BY e.id;""")
    buildings=[(r['id'],shape(r['geometry'])) for r in map(json.loads,raw.splitlines())]
    files=sorted(DIRECTORY.glob('*_sr_ss.tif'))
    if not files:raise RuntimeError('Descargue primero las teselas con download_gba.py')
    results={};evidence=[]
    for file in files:
        with rasterio.open(file) as ds:
            project=Transformer.from_crs(4326,ds.crs,always_xy=True).transform
            geoms=[(identifier,transform(geom,project,interleaved=False)) for identifier,geom in buildings]
            relevant=[(i,g) for i,g in geoms if box(*ds.bounds).covers(g)]
            if not relevant:continue
            bbox=(min(g.bounds[0] for _,g in relevant)-4,min(g.bounds[1] for _,g in relevant)-4,
                  max(g.bounds[2] for _,g in relevant)+4,max(g.bounds[3] for _,g in relevant)+4)
            win=from_bounds(*bbox,ds.transform).round_offsets().round_lengths().intersection(Window(0,0,ds.width,ds.height))
            heights=ds.read(1,window=win,masked=True).filled(np.nan)
            # GBA no aporta confianza por píxel en este archivo. Solo se filtra validez/rango.
            heights[(heights<2)|(heights>100)]=np.nan
            candidates=estimate(relevant,heights,np.ones_like(heights),ds.window_transform(win))
        for identifier, values in candidates.items():
            if identifier not in results or (values[1],values[2])>(results[identifier][1],results[identifier][2]):
                results[identifier]=(*values,file.name)
        evidence.append({'archivo':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'candidatos':len(candidates)})
    if not results:raise RuntimeError('No hay alturas GBA válidas; no se modifica PostGIS.')
    out=io.StringIO();writer=csv.writer(out,lineterminator='\n')
    for identifier,(height,coverage,count,file) in sorted(results.items()):
        writer.writerow([identifier,height,coverage,count,SOURCE,'2019-01-01',METHOD,file,'anio','CC BY-NC 4.0'])
    if args.importar:
        sql("BEGIN; CREATE TEMP TABLE gba_importadas (LIKE bagua_master.altura_estimada INCLUDING DEFAULTS);\n"
            "COPY gba_importadas(edificio_id,altura_m,cobertura,muestras,fuente,fecha,metodo,tesela,fecha_precision,licencia) FROM STDIN WITH (FORMAT csv);\n"+
            out.getvalue()+"\\.\nDELETE FROM bagua_master.altura_estimada WHERE fuente='GlobalBuildingAtlas (TUM)';\n"
            "INSERT INTO bagua_master.altura_estimada SELECT * FROM gba_importadas ON CONFLICT(edificio_id) DO NOTHING; COMMIT;\n")
    report={'fuente':SOURCE,'referencia_anual':2019,'licencia':'CC BY-NC 4.0','metodo':METHOD,
            'huellas_sin_google':len(buildings),'con_altura_gba':len(results),'teselas':evidence,
            'aviso':'Estimación satelital 2019 (con imágenes de 2018 donde fue necesario). Sin validación local en campo; el raster no incluye confianza por píxel.'}
    (DIRECTORY/'gba-alturas.csv').write_text(out.getvalue())
    (DIRECTORY/'gba-consulta.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
