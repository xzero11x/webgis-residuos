-- Proveniencia del archivo y del mapeo sin cambiar la identidad del lote normalizado.
ALTER TABLE gestion.importacion ADD COLUMN metadatos jsonb NOT NULL DEFAULT '{}'::jsonb;
