"""Importa la capa complementaria de edificaciones a bagua_master.edificio_complemento.

Reemplaza el contenido de esa tabla en UNA transacción (idempotente: mismas entradas, mismo
resultado). No toca bagua_master.edificio, sus alturas, los vínculos espaciales ni las PMTiles.
Requiere la migración 030 y haber ejecutado antes, en este orden:
  fusionar_edificaciones.py [--presencia] -> alturas_complemento.py (docker) -> este script.

Uso: .venv-gis/Scripts/python scripts/bagua-master/importar_complemento.py
"""
import csv
import io
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/bagua-master/complemento'
ALTURA_DEFECTO_M = 3.0
LICENCIAS = {
    'osm': 'ODbL-1.0 (OpenStreetMap contributors)',
    'google_ob_raw': 'CC BY 4.0 (Google Open Buildings v3)',
    'ms_buildings': 'ODbL-1.0 (Microsoft Global ML Building Footprints)',
    'google_presencia': 'CC BY 4.0 (Google Open Buildings 2.5D Temporal)',
}


def psql(sql, stdin_extra=''):
    result = subprocess.run(
        ['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
         'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        cwd=ROOT, input=sql + stdin_extra, text=True, capture_output=True, encoding='utf8')
    if result.returncode != 0:
        raise SystemExit(f'psql falló:\n{result.stderr}')
    return result.stdout


def main():
    report = json.loads((OUT / 'fusion.json').read_text(encoding='utf8'))
    version = f"fusion-{report['generado_utc']}-{report['salida']['sha256'][:12]}"
    heights = {}
    heights_path = OUT / 'alturas_complemento.csv'
    if heights_path.exists():
        for row in csv.reader(heights_path.read_text(encoding='utf8').splitlines()):
            heights[row[0]] = (float(row[1]), float(row[2]), int(row[3]))
    from shapely.geometry import shape
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator='\n')
    rows = 0
    for line in (OUT / 'edificios_complemento.geojsonl').read_text(encoding='utf8').splitlines():
        if not line:
            continue
        feature = json.loads(line)
        p = feature['properties']
        geom = shape(feature['geometry'])
        if geom.geom_type != 'Polygon' or geom.is_empty or not geom.is_valid:
            continue
        height = heights.get(p['id'])
        extra = {k: v for k, v in p.items() if k in ('osm_building', 'nombre', 'osm_levels', 'osm_height', 'recorte')}
        writer.writerow([
            p['id'], p['fuente'], p['confianza_geo'], p.get('confianza_valor', ''), p.get('registro_fuente', ''),
            p['area_m2'], p['regularizacion'], p.get('iou_rectangulo', ''), json.dumps(extra, ensure_ascii=False),
            height[0] if height else ALTURA_DEFECTO_M,
            'google_temporal' if height else 'estimada_default',
            height[1] if height else '', height[2] if height else '',
            LICENCIAS[p['fuente']], version, geom.wkt,
        ])
        rows += 1
    sql = (
        'BEGIN;\n'
        'CREATE TEMP TABLE cmp_in (id text, fuente text, confianza_geo text, confianza_valor text, registro_fuente text,'
        ' area_m2 double precision, regularizacion text, iou text, atributos text, altura_m double precision,'
        ' origen_altura text, cobertura text, muestras text, licencia text, version_fusion text, wkt text) ON COMMIT DROP;\n'
        "COPY cmp_in FROM STDIN WITH (FORMAT csv, NULL '');\n"
    )
    tail = (
        '\\.\n'
        'DELETE FROM bagua_master.edificio_complemento;\n'
        'INSERT INTO bagua_master.edificio_complemento(id,fuente,confianza_geo,confianza_valor,registro_fuente,area_m2,'
        'regularizacion,iou_rectangulo,atributos,altura_m,origen_altura,altura_cobertura,altura_muestras,licencia,'
        'version_fusion,geom,geom_utm)\n'
        "SELECT id,fuente,confianza_geo,nullif(confianza_valor,'')::double precision,registro_fuente,area_m2,regularizacion,"
        "nullif(iou,'')::double precision,atributos::jsonb,altura_m,origen_altura,nullif(cobertura,'')::double precision,"
        "nullif(muestras,'')::integer,licencia,version_fusion,ST_SetSRID(ST_GeomFromText(wkt),4326),"
        'ST_Transform(ST_SetSRID(ST_GeomFromText(wkt),4326),32717) FROM cmp_in;\n'
        'COMMIT;\n'
        "SELECT fuente,confianza_geo,origen_altura,count(*) FROM bagua_master.edificio_complemento GROUP BY 1,2,3 ORDER BY 1,2,3;\n"
    )
    print(f'Importando {rows} huellas ({version}) ...', flush=True)
    print(psql(sql, buffer.getvalue() + tail))


if __name__ == '__main__':
    main()
