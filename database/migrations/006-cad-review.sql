-- Additive per-file geometry inventory. Unregistered originals keep SRID 0.
CREATE TABLE cad_review (
  id text PRIMARY KEY,
  source text NOT NULL,
  layer text NOT NULL,
  properties jsonb NOT NULL,
  geom_original geometry(Geometry,0) NOT NULL,
  geom geometry(Geometry,4326),
  dataset_hash text NOT NULL
);
CREATE INDEX cad_review_source_layer_idx ON cad_review(source,layer);
CREATE INDEX cad_review_geom_idx ON cad_review USING gist(geom);
