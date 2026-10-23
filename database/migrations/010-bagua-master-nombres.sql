-- BAGUA MASTER: nombres complementarios de calles. Conjunto INDEPENDIENTE del snapshot de Overture:
-- no modifica red_vial (ni sus atributos ni sus geometrías) y solo se usa para generar rótulos y fichas.
-- Cada fila asocia el identificador original de un tramo de Overture sin nombre con un nombre
-- documental recuperado del DWG de Tomaque, con la evidencia que lo respalda.
-- Sin claves foráneas, como el resto del esquema: cada importación reemplaza el conjunto por huella.

CREATE TABLE bagua_master.nombre_complementario (
  segmento_id text PRIMARY KEY,
  nombre text NOT NULL,
  nombre_documental text NOT NULL,
  origen text NOT NULL CHECK (origen IN ('dwg-tomaque')),
  nivel text NOT NULL CHECK (nivel IN ('texto', 'continuidad')),
  respaldo_rpu text NOT NULL CHECK (respaldo_rpu IN ('respaldado', 'sin_cobertura', 'no_confirmado')),
  evidencia jsonb NOT NULL,
  fuente_archivo text NOT NULL,
  fuente_sha256 text NOT NULL,
  version_overture text NOT NULL,
  aviso text NOT NULL,
  dataset_hash text NOT NULL,
  importado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nombre_complementario_nombre_idx ON bagua_master.nombre_complementario (lower(nombre));
COMMENT ON TABLE bagua_master.nombre_complementario IS
  'Nombres documentales del DWG de Tomaque para tramos de Overture sin names.primary. No oficiales ni vigentes.';
