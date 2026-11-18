CREATE TABLE gestion.unidad (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), predio_id uuid NOT NULL REFERENCES gestion.predio(id),
 codigo text NOT NULL, nombre text NOT NULL, tipo text NOT NULL CHECK(tipo IN ('unidad','seccion')),
 evidencia text NOT NULL CHECK(length(trim(evidencia))>=5), activa boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, creado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(predio_id,codigo)
);
CREATE TRIGGER archivo_unidad BEFORE INSERT ON gestion.unidad FOR EACH ROW EXECUTE FUNCTION gestion.proteger_predio_archivado();
