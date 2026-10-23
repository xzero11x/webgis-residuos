-- Second-pass DWG layers (docs/dwg-segunda-pasada.md). Review evidence only:
-- separate from cad_features, municipal_cartography, rutas and puntos_recoleccion.
CREATE TABLE cad_second_pass (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (
    'rutas-bloques', 'puntos-topograficos', 'manzanas', 'etiquetas-lote',
    'toponimia', 'hojas-planos', 'cotas')),
  status text NOT NULL CHECK (status IN ('por revisar', 'documental')),
  review_note text,
  source text NOT NULL,
  crs text NOT NULL,
  crs_status text NOT NULL CHECK (crs_status IN ('declarado', 'provisional')),
  offset_e double precision NOT NULL DEFAULT 0,
  offset_n double precision NOT NULL DEFAULT 0,
  properties jsonb NOT NULL,
  geom_original geometry(Geometry,32717) NOT NULL,
  geom geometry(Geometry,4326) NOT NULL,
  is_valid boolean NOT NULL,
  validity_reason text,
  dataset_hash text NOT NULL
);
CREATE INDEX cad_second_pass_geom_idx ON cad_second_pass USING gist(geom);
CREATE INDEX cad_second_pass_kind_idx ON cad_second_pass(kind);

COMMENT ON TABLE cad_second_pass IS
  'Capas de la segunda pasada DWG para revisión técnica. No son rutas, predios ni paradas operativas.';
COMMENT ON COLUMN cad_second_pass.geom_original IS
  'Coordenadas UTM 17S tras la traslación documentada en crs. Dibujo original = ST_Translate(geom_original, -offset_e, -offset_n).';
COMMENT ON COLUMN cad_second_pass.crs_status IS
  'declarado: GEODATA EPSG:32717 del DWG. provisional: traslación medida (Tomaque o bloque no insertado) pendiente de decisión.';
COMMENT ON COLUMN cad_second_pass.geom IS
  'Representación EPSG:4326. Se conserva aunque no sea válida; is_valid lo indica sin reparar la geometría.';
