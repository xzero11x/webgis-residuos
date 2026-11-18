CREATE TABLE gestion.vinculo_espacial (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 predio_id uuid NOT NULL REFERENCES gestion.predio(id),
 edificio_id text NOT NULL REFERENCES bagua_master.edificio(id),
 estado text NOT NULL DEFAULT 'propuesto' CHECK(estado IN ('propuesto','revision','confirmado','rechazado','desvinculado')),
 criterio text NOT NULL CHECK(criterio IN ('seleccion_mapa','interseccion_vista')),
 evidencia text NOT NULL CHECK(length(trim(evidencia))>=5),
 version_overture text NOT NULL,
 creado_por uuid NOT NULL REFERENCES gestion.usuario(id), creado_en timestamptz NOT NULL DEFAULT now(),
 revisado_por uuid REFERENCES gestion.usuario(id), revisado_en timestamptz,
 motivo text, compartido boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(predio_id,edificio_id),
 CHECK(estado='propuesto' OR (revisado_por IS NOT NULL AND revisado_en IS NOT NULL AND motivo IS NOT NULL AND length(trim(motivo))>=5))
);
CREATE INDEX ON gestion.vinculo_espacial(edificio_id,estado);
CREATE FUNCTION gestion.validar_revision_espacial() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cerrado boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('espacial:' || NEW.edificio_id));
 SELECT archivado INTO cerrado FROM gestion.predio WHERE id=NEW.predio_id FOR SHARE;
 IF cerrado THEN RAISE EXCEPTION 'Predio archivado' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.estado<>'propuesto' OR NEW.version<>1 THEN RAISE EXCEPTION 'Primero proponer candidato' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.predio_id<>OLD.predio_id OR NEW.edificio_id<>OLD.edificio_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Identidad o versión inválida' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD.estado IN ('propuesto','revision') AND NEW.estado IN ('confirmado','rechazado','revision','desvinculado')) OR (OLD.estado='confirmado' AND NEW.estado IN ('desvinculado','revision')) OR (OLD.estado IN ('rechazado','desvinculado') AND NEW.estado='revision')) THEN RAISE EXCEPTION 'Transición no permitida' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.estado='confirmado' AND NOT NEW.compartido AND EXISTS(SELECT 1 FROM gestion.vinculo_espacial WHERE edificio_id=NEW.edificio_id AND predio_id<>NEW.predio_id AND estado='confirmado') THEN RAISE EXCEPTION 'Edificio compartido requiere revisión explícita' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER proteger_revision_espacial BEFORE INSERT OR UPDATE ON gestion.vinculo_espacial FOR EACH ROW EXECUTE FUNCTION gestion.validar_revision_espacial();
