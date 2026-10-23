-- Unificación territorial (scripts/gis/unify_territory.py). Tablas aditivas: no reemplazan
-- cad_features, cad_review, cad_second_pass, municipal_cartography ni rutas.
-- Sin claves foráneas: cada importación reemplaza por completo las filas de su huella
-- (dataset_hash), así que las referencias entre tablas se validan en la importación.

CREATE TABLE territorio_entidad (
  id text PRIMARY KEY,
  kind text NOT NULL,
  nombre text NOT NULL,
  nombre_normalizado text,
  criterio text NOT NULL,
  estado jsonb NOT NULL,
  provisional boolean NOT NULL,
  referencia text NOT NULL,
  num_representaciones integer NOT NULL,
  num_atributos integer NOT NULL,
  num_conflictos integer NOT NULL,
  marco geometry(Geometry,32717) NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX territorio_entidad_geom_idx ON territorio_entidad USING gist(geom);
CREATE INDEX territorio_entidad_kind_idx ON territorio_entidad(kind);

CREATE TABLE territorio_representacion (
  key text PRIMARY KEY,
  entidad_id text NOT NULL,
  source text NOT NULL,
  ref text,
  layer text,
  entity_type text,
  kind text NOT NULL,
  geom_type text NOT NULL,
  crs_status text NOT NULL,
  offset_e double precision NOT NULL,
  offset_n double precision NOT NULL,
  desviacion_m double precision NOT NULL,
  origen text NOT NULL,
  texto text,
  atributos jsonb NOT NULL DEFAULT '{}',
  marco geometry(Geometry,32717) NOT NULL,
  geom_original geometry(Geometry,0),
  geom geometry(Geometry,4326) NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX territorio_representacion_entidad_idx ON territorio_representacion(entidad_id);
CREATE INDEX territorio_representacion_geom_idx ON territorio_representacion USING gist(geom);

CREATE TABLE territorio_atributo (
  id text PRIMARY KEY,
  entidad_id text NOT NULL,
  clave text NOT NULL,
  valor jsonb NOT NULL,
  tipo text NOT NULL,
  fuente jsonb NOT NULL,
  justificacion text NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX territorio_atributo_entidad_idx ON territorio_atributo(entidad_id);

CREATE TABLE territorio_relacion (
  id text PRIMARY KEY,
  tipo text NOT NULL,
  desde text NOT NULL,
  hacia text NOT NULL,
  evidencia jsonb NOT NULL,
  regla text NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX territorio_relacion_desde_idx ON territorio_relacion(desde);
CREATE INDEX territorio_relacion_hacia_idx ON territorio_relacion(hacia);

CREATE TABLE territorio_conflicto (
  id text PRIMARY KEY,
  entidad_id text,
  propiedad text NOT NULL,
  estado text NOT NULL,
  valores jsonb NOT NULL,
  evidencia jsonb NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX territorio_conflicto_entidad_idx ON territorio_conflicto(entidad_id);

CREATE TABLE territorio_excepcion (
  id text PRIMARY KEY,
  entidad_id text,
  representacion text,
  causa text NOT NULL,
  datos jsonb NOT NULL,
  nota text NOT NULL,
  dataset_hash text NOT NULL
);

CREATE TABLE territorio_regla (
  id text NOT NULL,
  version integer NOT NULL,
  descripcion text NOT NULL,
  parametros jsonb NOT NULL DEFAULT '{}',
  dataset_hash text NOT NULL,
  PRIMARY KEY (id, version)
);

COMMENT ON TABLE territorio_entidad IS
  'Entidades territoriales consolidadas. La identidad se demuestra por geometría dentro de la tolerancia de cada clase; las relaciones, conflictos y excepciones están en sus tablas.';
COMMENT ON COLUMN territorio_representacion.marco IS
  'Coordenadas del marco adoptado (EPSG:32717). Para DWG: coordenadas brutas más la traslación adoptada (offset_e, offset_n).';
COMMENT ON COLUMN territorio_representacion.geom_original IS
  'Coordenadas brutas del DWG (SRID 0, como en cad_review). NULL en elementos derivados sin coordenada bruta.';
