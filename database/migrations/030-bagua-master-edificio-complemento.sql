-- Capa complementaria de edificaciones: huellas de otras fuentes abiertas que Overture no tiene.
-- Es ADITIVA: no modifica ni reemplaza bagua_master.edificio (cuyos identificadores GERS están
-- referenciados por alturas, vínculos espaciales y expedientes) ni las teselas PMTiles de Overture.
-- Cada huella conserva su fuente, su nivel de confianza geométrica y el origen de su altura; ninguna
-- es un predio ni un dato validado en campo. Se rellena con scripts/bagua-master/importar_complemento.py.
CREATE TABLE bagua_master.edificio_complemento (
  id text PRIMARY KEY,
  fuente text NOT NULL CHECK (fuente IN ('osm','google_ob_raw','ms_buildings','google_presencia','sat_sam','dron')),
  confianza_geo text NOT NULL CHECK (confianza_geo IN ('alta','media','baja')),
  confianza_valor double precision CHECK (confianza_valor IS NULL OR (confianza_valor >= 0 AND confianza_valor <= 1)),
  registro_fuente text,
  area_m2 double precision NOT NULL CHECK (area_m2 > 0),
  regularizacion text NOT NULL CHECK (regularizacion IN ('ninguna','rectangulo','simplificada')),
  iou_rectangulo double precision,
  atributos jsonb NOT NULL DEFAULT '{}'::jsonb,
  altura_m double precision NOT NULL CHECK (altura_m > 0 AND altura_m <= 100),
  origen_altura text NOT NULL CHECK (origen_altura IN ('google_temporal','estimada_default','dron_dsm')),
  altura_cobertura double precision,
  altura_muestras integer,
  licencia text NOT NULL,
  version_fusion text NOT NULL,
  geom geometry(Polygon,4326) NOT NULL,
  geom_utm geometry(Polygon,32717) NOT NULL,
  importado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bagua_master_edificio_complemento_geom_idx ON bagua_master.edificio_complemento USING gist(geom);
CREATE INDEX bagua_master_edificio_complemento_fuente_idx ON bagua_master.edificio_complemento(fuente, confianza_geo);
COMMENT ON TABLE bagua_master.edificio_complemento IS
  'Huellas complementarias (OSM, Microsoft, Google, presencia satelital). Aditiva: no sustituye a Overture. No son predios ni datos validados en campo.';
COMMENT ON COLUMN bagua_master.edificio_complemento.origen_altura IS
  'estimada_default = 3 m provisionales sin medición; se sobrescribe con dron_dsm cuando exista el DSM del dron.';
