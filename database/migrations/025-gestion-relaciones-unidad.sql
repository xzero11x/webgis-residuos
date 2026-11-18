CREATE TABLE gestion.relacion_unidad (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unidad_id uuid NOT NULL REFERENCES gestion.unidad(id),
 persona_id uuid REFERENCES gestion.persona(id), servicio_id uuid REFERENCES gestion.servicio(id),
 tipo text NOT NULL CHECK(tipo IN ('contribuyente','ocupante','propietario_declarado','responsable','otro','servicio')),
 desde date NOT NULL, hasta date, evidencia text NOT NULL CHECK(length(trim(evidencia))>=5),
 estado text CHECK(estado IN ('prevista','pendiente','confirmada')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), creado_por uuid NOT NULL REFERENCES gestion.usuario(id),
 creado_en timestamptz NOT NULL DEFAULT now(),
 CHECK(hasta IS NULL OR hasta>=desde),
 CHECK((tipo='servicio' AND servicio_id IS NOT NULL AND persona_id IS NULL AND estado IS NOT NULL) OR (tipo<>'servicio' AND persona_id IS NOT NULL AND servicio_id IS NULL AND estado IS NULL))
);
CREATE FUNCTION gestion.validar_relacion_unidad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid gestion.unidad; pred gestion.predio;
BEGIN
 SELECT * INTO uid FROM gestion.unidad WHERE id=NEW.unidad_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unidad inexistente' USING ERRCODE='23503'; END IF;
 SELECT * INTO pred FROM gestion.predio WHERE id=uid.predio_id FOR SHARE;
 IF pred.archivado OR NOT uid.activa THEN RAISE EXCEPTION 'Predio o unidad inactivos' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.unidad_id<>OLD.unidad_id OR NEW.persona_id IS DISTINCT FROM OLD.persona_id OR NEW.servicio_id IS DISTINCT FROM OLD.servicio_id OR NEW.tipo<>OLD.tipo OR NEW.desde<>OLD.desde OR NEW.version<>OLD.version+1 OR OLD.hasta IS NOT NULL) THEN RAISE EXCEPTION 'Solo cierre versionado de relación abierta' USING ERRCODE='23514'; END IF;
 IF NEW.persona_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gestion.persona p WHERE p.id=NEW.persona_id AND p.fuente_id=pred.fuente_id) THEN RAISE EXCEPTION 'Persona de fuente incompatible' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.servicio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gestion.servicio WHERE id=NEW.servicio_id AND activo) THEN RAISE EXCEPTION 'Servicio inactivo' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM gestion.relacion_unidad r WHERE r.unidad_id=NEW.unidad_id AND r.id<>NEW.id AND r.tipo=NEW.tipo AND r.persona_id IS NOT DISTINCT FROM NEW.persona_id AND r.servicio_id IS NOT DISTINCT FROM NEW.servicio_id AND daterange(r.desde,r.hasta,'[]') && daterange(NEW.desde,NEW.hasta,'[]')) THEN RAISE EXCEPTION 'Periodo de relación duplicado o solapado' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER proteger_relacion_unidad BEFORE INSERT OR UPDATE ON gestion.relacion_unidad FOR EACH ROW EXECUTE FUNCTION gestion.validar_relacion_unidad();
