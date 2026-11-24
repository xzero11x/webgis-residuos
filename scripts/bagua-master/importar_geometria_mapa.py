"""Importa la geometría cartográfica de las huellas de Overture (recortadas y suavizadas).

Lee `data/bagua-master/coherencia/edificios_recortados.geojsonl` (salida de ajustar_coherencia.py)
y reemplaza en una transacción `bagua_master.edificio_geom_mapa` (migración 032). La usan las vistas
2.5D/3D; la huella original de `bagua_master.edificio` no cambia.

  .venv-gis/Scripts/python scripts/bagua-master/importar_geometria_mapa.py
"""
import csv
import io
import json
from pathlib import Path

from shapely.geometry import shape

from importar_complemento import psql

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'data/bagua-master/coherencia/edificios_recortados.geojsonl'


def main():
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator='\n')
    rows = 0
    for line in SOURCE.read_text(encoding='utf8').splitlines():
        if not line.strip():
            continue
        feature = json.loads(line)
        geom = shape(feature['geometry'])
        if geom.geom_type != 'Polygon' or not geom.is_valid or geom.is_empty:
            continue
        writer.writerow([feature['properties']['id'], feature['properties'].get('motivo', 'recorte_calzada'), geom.wkt])
        rows += 1
    sql = (
        'BEGIN;\n'
        'CREATE TEMP TABLE geo_in (id text, motivo text, wkt text) ON COMMIT DROP;\n'
        "COPY geo_in FROM STDIN WITH (FORMAT csv);\n"
    )
    tail = (
        '\\.\n'
        'DELETE FROM bagua_master.edificio_geom_mapa;\n'
        "INSERT INTO bagua_master.edificio_geom_mapa(edificio_id,motivo,geom)\n"
        "SELECT g.id,g.motivo,ST_SetSRID(ST_GeomFromText(g.wkt),4326) FROM geo_in g\n"
        '  JOIN bagua_master.edificio e ON e.id=g.id;\n'
        'COMMIT;\n'
        'SELECT count(*) FROM bagua_master.edificio_geom_mapa;\n'
    )
    print(f'Importando {rows} geometrías cartográficas ...', flush=True)
    print('En la base:', psql(sql, buffer.getvalue() + tail).strip())


if __name__ == '__main__':
    main()
