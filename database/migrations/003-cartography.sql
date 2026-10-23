-- Interpretations are versioned separately from immutable CAD staging and routes.
CREATE TABLE municipal_cartography (
  id text PRIMARY KEY,
  kind text NOT NULL,
  properties jsonb NOT NULL,
  geom_original geometry(Geometry,32717) NOT NULL,
  geom geometry(Geometry,4326),
  is_valid boolean NOT NULL,
  validity_reason text,
  dataset_hash text NOT NULL
);
CREATE INDEX municipal_cartography_geom_idx ON municipal_cartography USING gist(geom);
CREATE INDEX municipal_cartography_kind_idx ON municipal_cartography(kind);
