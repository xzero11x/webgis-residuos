-- Correcciones sobre la misma entrega; identidad e historial permanecen.
ALTER TABLE gestion.entrega ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN motivo_cambio text, ADD COLUMN usuario_cambio uuid REFERENCES gestion.usuario(id),
 ADD COLUMN fecha_cambio timestamptz;
CREATE TABLE gestion.entrega_revision (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entrega_id uuid NOT NULL REFERENCES gestion.entrega(id), version integer NOT NULL,
 motivo text NOT NULL CHECK(length(trim(motivo))>=5), usuario_id uuid NOT NULL REFERENCES gestion.usuario(id),
 creado_en timestamptz NOT NULL DEFAULT now(), anterior jsonb NOT NULL, nuevo jsonb NOT NULL,
 UNIQUE(entrega_id,version)
);
CREATE FUNCTION gestion.validar_cambio_entrega() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent gestion.predio; participation gestion.participacion;
BEGIN
 SELECT * INTO participation FROM gestion.participacion WHERE id=OLD.participacion_id FOR SHARE;
 SELECT * INTO parent FROM gestion.predio WHERE id=participation.predio_id FOR SHARE;
 IF parent.archivado OR OLD.anulada OR NEW.version<>OLD.version+1 OR
 NEW.id<>OLD.id OR NEW.participacion_id<>OLD.participacion_id OR NEW.clave<>OLD.clave OR NEW.responsable_id<>OLD.responsable_id OR NEW.creado_en<>OLD.creado_en OR
 NEW.usuario_cambio IS NULL OR NEW.motivo_cambio IS NULL OR length(trim(NEW.motivo_cambio))<5 THEN
  RAISE EXCEPTION 'Entrega inmutable, archivada o cambio sin revisión' USING ERRCODE='23514';
 END IF;
 IF NEW.fecha<participation.desde OR (participation.hasta IS NOT NULL AND NEW.fecha>participation.hasta) OR NEW.fecha>(now() AT TIME ZONE 'America/Lima')::date THEN
  RAISE EXCEPTION 'Fecha fuera del periodo documentado' USING ERRCODE='23514';
 END IF;
 IF NEW.anulada AND (NEW.motivo_anulacion IS NULL OR length(trim(NEW.motivo_anulacion))<5) THEN
  RAISE EXCEPTION 'Anulación sin motivo' USING ERRCODE='23514';
 END IF;
 NEW.fecha_cambio=now();
 RETURN NEW;
END $$;
CREATE TRIGGER entrega_cambio_valido BEFORE UPDATE ON gestion.entrega FOR EACH ROW EXECUTE FUNCTION gestion.validar_cambio_entrega();
CREATE FUNCTION gestion.historiar_entrega() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gestion.entrega_revision(entrega_id,version,motivo,usuario_id,anterior,nuevo)
 VALUES(NEW.id,NEW.version,NEW.motivo_cambio,NEW.usuario_cambio,to_jsonb(OLD),to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER entrega_revision_registrada AFTER UPDATE ON gestion.entrega FOR EACH ROW EXECUTE FUNCTION gestion.historiar_entrega();
