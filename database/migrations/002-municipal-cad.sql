-- Documentary geometry is separate from operational validation and DEMO data.
ALTER TABLE rutas ALTER COLUMN horario DROP NOT NULL;
ALTER TABLE rutas ALTER COLUMN frecuencia DROP NOT NULL;
ALTER TABLE rutas ADD COLUMN color text CHECK (color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE rutas ADD COLUMN origen text NOT NULL DEFAULT 'demo';
ALTER TABLE rutas ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE rutas ADD COLUMN geom_original geometry(MultiLineString,32717);

CREATE TABLE municipal_imports (
  dataset text PRIMARY KEY,
  checksum text NOT NULL,
  manifest jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

-- Raw CAD staging: unknown CRS stays SRID 0; invalid geometry is retained here.
-- Only valid, explicitly referenced geometry is exposed through geom.
CREATE TABLE cad_features (
  key text PRIMARY KEY,
  category text NOT NULL,
  layer text NOT NULL,
  entity_type text NOT NULL,
  text_value text,
  color integer,
  hidden boolean NOT NULL,
  source_srid integer,
  in_study_area boolean NOT NULL,
  source_refs jsonb NOT NULL,
  attributes jsonb NOT NULL,
  geom_original geometry,
  geom geometry(Geometry,4326),
  is_valid boolean,
  validity_reason text
);
CREATE INDEX cad_features_geom_idx ON cad_features USING gist(geom);
CREATE INDEX cad_features_category_idx ON cad_features(category);
CREATE INDEX cad_features_sources_idx ON cad_features USING gin(source_refs jsonb_path_ops);
