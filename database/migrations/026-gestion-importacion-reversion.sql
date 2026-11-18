CREATE TABLE gestion.importacion_cambio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid NOT NULL REFERENCES gestion.importacion(id),
 predio_id uuid NOT NULL REFERENCES gestion.predio(id), tipo text NOT NULL CHECK(tipo IN ('alta','actualizacion')),
 anterior jsonb, posterior jsonb NOT NULL, campos text[] NOT NULL,
 revertidos text[] NOT NULL DEFAULT '{}', version_esperada integer NOT NULL CHECK(version_esperada>0),
 creado_en timestamptz NOT NULL DEFAULT now(), UNIQUE(lote_id,predio_id)
);
CREATE INDEX ON gestion.importacion_cambio(lote_id);
CREATE TABLE gestion.importacion_reversion (
 clave uuid PRIMARY KEY, lote_id uuid NOT NULL REFERENCES gestion.importacion(id),
 usuario_id uuid NOT NULL REFERENCES gestion.usuario(id), motivo text NOT NULL CHECK(length(trim(motivo))>=5),
 solicitud jsonb NOT NULL, resultado jsonb NOT NULL, creado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE gestion.importacion_cambio IS 'Manifest exacto desde migración 026. Lotes anteriores sin manifest no se revierten automáticamente.';
