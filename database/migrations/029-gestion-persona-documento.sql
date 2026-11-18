-- Documento de identificación opcional de la persona. Permite la búsqueda por documento
-- para perfiles autorizados. En entornos de ensayo solo se cargan identificadores
-- ficticios (formato F-########), nunca documentos de personas reales.
ALTER TABLE gestion.persona ADD COLUMN IF NOT EXISTS documento text;
ALTER TABLE gestion.persona DROP CONSTRAINT IF EXISTS persona_documento_formato;
ALTER TABLE gestion.persona ADD CONSTRAINT persona_documento_formato
  CHECK (documento IS NULL OR length(trim(documento)) BETWEEN 4 AND 20);
CREATE INDEX IF NOT EXISTS persona_documento_idx ON gestion.persona (documento) WHERE documento IS NOT NULL;
