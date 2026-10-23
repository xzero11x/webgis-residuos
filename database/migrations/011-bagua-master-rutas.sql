-- BAGUA MASTER, fase 2: rutas municipales de recolección. Conjunto INDEPENDIENTE: copia documental de
-- los trazos del paquete municipal (public.rutas), sin ajustarlos a las calles de Overture y sin
-- referenciar ni modificar public.rutas, red_vial, edificio ni el resto del esquema.
-- Sin claves foráneas, como el resto del esquema: cada importación reemplaza el conjunto por huella.

CREATE TABLE bagua_master.ruta (
  codigo text PRIMARY KEY,
  orden int NOT NULL,
  nombre text NOT NULL,
  color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  estado text NOT NULL CHECK (estado IN ('georreferenciada', 'revision')),
  fuente_archivo text NOT NULL,
  fuente_sha256 text NOT NULL,
  nota text NOT NULL,
  advertencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  sectores jsonb NOT NULL DEFAULT '[]'::jsonb,
  crs text NOT NULL,
  segmentos int NOT NULL,
  longitud_trazos_m numeric NOT NULL,
  significado_longitud text NOT NULL,
  horario_estado text NOT NULL,
  sentido_estado text NOT NULL,
  flechas jsonb NOT NULL,
  geom geometry(MultiLineString, 4326) NOT NULL CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
  aviso text NOT NULL,
  dataset_hash text NOT NULL,
  importado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ruta_geom_idx ON bagua_master.ruta USING gist (geom);

CREATE TABLE bagua_master.ruta_flecha (
  id text PRIMARY KEY,
  ruta_codigo text NOT NULL,
  rumbo numeric NOT NULL CHECK (rumbo >= 0 AND rumbo < 360),
  verificada boolean NOT NULL,
  duplicada_de text,
  alineacion_grados numeric NOT NULL,
  distancia_trazo_m numeric NOT NULL,
  fuente text NOT NULL,
  capa text NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX ruta_flecha_ruta_idx ON bagua_master.ruta_flecha (ruta_codigo);

CREATE TABLE bagua_master.ruta_marcador (
  id text PRIMARY KEY,
  ruta_codigo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('inicio', 'fin', 'parada')),
  nombre text NOT NULL,
  capa text NOT NULL,
  fuente text NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  dataset_hash text NOT NULL
);
CREATE INDEX ruta_marcador_ruta_idx ON bagua_master.ruta_marcador (ruta_codigo);

COMMENT ON TABLE bagua_master.ruta IS
  'Rutas municipales documentadas (trazos originales). No acreditan vigencia operativa ni precisión topográfica.';
COMMENT ON TABLE bagua_master.ruta_flecha IS
  'Triángulos de sentido recuperados del plano y asociados a una ruta por proximidad exclusiva; solo se dibujan los verificados.';
