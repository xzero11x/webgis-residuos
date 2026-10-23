-- BAGUA MASTER: cartografía urbana de Overture Maps (versión fijada en scripts/bagua-master/ambito.json).
-- Esquema independiente: no referencia ni modifica tablas del WebGIS municipal (rutas, predios,
-- cad_*, territorio_*, municipal_*). Sin claves foráneas: cada importación reemplaza por completo
-- el conjunto con su dataset_hash, dentro de una transacción.

CREATE SCHEMA IF NOT EXISTS bagua_master;

CREATE TABLE bagua_master.version (
  id text PRIMARY KEY,
  version_overture text NOT NULL,
  esquema_overture text NOT NULL,
  atribucion text NOT NULL,
  extraccion_utc timestamptz NOT NULL,
  descarga_bbox double precision[] NOT NULL,
  ventana_urbana double precision[] NOT NULL,
  manifiesto_sha256 text NOT NULL,
  paquete_sha256 text NOT NULL,
  importado_en timestamptz NOT NULL DEFAULT now(),
  resumen jsonb NOT NULL
);

-- Inventario real por conjunto de Overture: recuentos, validez y licencias de origen.
CREATE TABLE bagua_master.conjunto (
  nombre text PRIMARY KEY,
  tema text NOT NULL,
  tipo text NOT NULL,
  archivo text NOT NULL,
  sha256 text NOT NULL,
  filas integer NOT NULL,
  ids_unicos integer NOT NULL,
  geometria_nula integer NOT NULL,
  geometria_vacia integer NOT NULL,
  geometria_invalida integer NOT NULL,
  tipos_geometria jsonb NOT NULL,
  fuentes_primarias jsonb NOT NULL,
  dataset_hash text NOT NULL
);

-- Elementos. Todas las geometrías proceden del snapshot de Overture; ninguna se rellena con otras fuentes.
-- geom: EPSG:4326 (como Overture). geom_utm: EPSG:32718 (UTM 18S, Perú) para medidas métricas.
-- geom_valida: false cuando Overture entrega una geometría inválida; se conserva sin reparar.
CREATE TABLE bagua_master.red_vial (
  id text PRIMARY KEY,
  clase text,
  subclase text,
  nombre text,
  nombres jsonb NOT NULL DEFAULT '{}',
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(LineString,4326) NOT NULL,
  geom_utm geometry(LineString,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX bagua_master_red_vial_geom_idx ON bagua_master.red_vial USING gist(geom);
CREATE INDEX bagua_master_red_vial_clase_idx ON bagua_master.red_vial(clase);

CREATE TABLE bagua_master.conector (
  id text PRIMARY KEY,
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Point,4326) NOT NULL,
  geom_utm geometry(Point,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX bagua_master_conector_geom_idx ON bagua_master.conector USING gist(geom);

CREATE TABLE bagua_master.edificio (
  id text PRIMARY KEY,
  clase text,
  subtipo text,
  nombre text,
  altura_m double precision,
  num_pisos integer,
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  geom_utm geometry(Geometry,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX bagua_master_edificio_geom_idx ON bagua_master.edificio USING gist(geom);
CREATE INDEX bagua_master_edificio_clase_idx ON bagua_master.edificio(clase);

-- Partes de edificio: el snapshot no contiene ninguna en el área. La tabla existe para que la
-- ausencia quede registrada y para que una descarga futura se importe sin cambios de esquema.
CREATE TABLE bagua_master.parte_edificio (
  id text PRIMARY KEY,
  clase text,
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  geom_utm geometry(Geometry,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);

CREATE TABLE bagua_master.uso_suelo (
  id text PRIMARY KEY,
  clase text,
  subtipo text,
  nombre text,
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  geom_utm geometry(Geometry,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX bagua_master_uso_suelo_geom_idx ON bagua_master.uso_suelo USING gist(geom);

CREATE TABLE bagua_master.agua (
  id text PRIMARY KEY,
  clase text,
  subtipo text,
  nombre text,
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  geom_utm geometry(Geometry,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX bagua_master_agua_geom_idx ON bagua_master.agua USING gist(geom);

-- Terreno natural (base/land): el snapshot no tiene elementos en el área; misma regla que parte_edificio.
CREATE TABLE bagua_master.terreno (
  id text PRIMARY KEY,
  clase text,
  subtipo text,
  nombre text,
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  geom_utm geometry(Geometry,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);

CREATE TABLE bagua_master.lugar (
  id text PRIMARY KEY,
  categoria text,
  nombre text,
  nombres jsonb NOT NULL DEFAULT '{}',
  atributos jsonb NOT NULL,
  fuentes jsonb NOT NULL,
  archivo_overture text NOT NULL,
  geom geometry(Point,4326) NOT NULL,
  geom_utm geometry(Point,32718) NOT NULL,
  geom_valida boolean NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX bagua_master_lugar_geom_idx ON bagua_master.lugar USING gist(geom);
CREATE INDEX bagua_master_lugar_nombre_idx ON bagua_master.lugar(lower(nombre));

COMMENT ON SCHEMA bagua_master IS
  'BAGUA MASTER: cartografía urbana de Overture Maps 2026-09-23.1. Independiente del WebGIS municipal.';
