CREATE TABLE servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL,
  color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'), is_demo boolean NOT NULL DEFAULT true
);
CREATE TABLE sectores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL,
  geom geometry(MultiPolygon,4326) NOT NULL,
  is_demo boolean NOT NULL DEFAULT true,
  CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom))
);
CREATE INDEX sectores_geom_idx ON sectores USING gist(geom);
CREATE TABLE rutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE,
  nombre text NOT NULL, servicio_id uuid NOT NULL REFERENCES servicios(id),
  horario text NOT NULL, frecuencia text NOT NULL,
  geom geometry(MultiLineString,4326) NOT NULL, is_demo boolean NOT NULL DEFAULT true,
  UNIQUE(id,servicio_id), CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom))
);
CREATE INDEX rutas_geom_idx ON rutas USING gist(geom);
CREATE TABLE puntos_recoleccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL,
  ruta_id uuid NOT NULL REFERENCES rutas(id), geom geometry(Point,4326) NOT NULL,
  is_demo boolean NOT NULL DEFAULT true
);
CREATE INDEX puntos_geom_idx ON puntos_recoleccion USING gist(geom);
CREATE TABLE predios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE,
  direccion text NOT NULL, sector_id uuid NOT NULL REFERENCES sectores(id),
  observaciones text NOT NULL DEFAULT '', geom geometry(MultiPolygon,4326) NOT NULL,
  is_demo boolean NOT NULL DEFAULT true, dataset text NOT NULL DEFAULT 'demo-manual', demo_key text UNIQUE,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
  CHECK (length(codigo) BETWEEN 3 AND 40), CHECK (length(direccion) BETWEEN 3 AND 200)
);
CREATE INDEX predios_geom_idx ON predios USING gist(geom);
CREATE INDEX predios_sector_idx ON predios(sector_id);
CREATE TABLE personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL,
  is_demo boolean NOT NULL DEFAULT true
);
CREATE TABLE persona_predio (
  predio_id uuid NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES personas(id),
  vinculo text NOT NULL CHECK(vinculo IN ('Propietario','Ocupante','Responsable','Contribuyente','Otro')),
  PRIMARY KEY(predio_id,persona_id)
);
CREATE TABLE predio_servicio (
  predio_id uuid NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicios(id), ruta_id uuid,
  PRIMARY KEY(predio_id,servicio_id),
  FOREIGN KEY(ruta_id,servicio_id) REFERENCES rutas(id,servicio_id)
);
CREATE INDEX predio_servicio_ruta_idx ON predio_servicio(ruta_id);
