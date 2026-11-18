ALTER TABLE gestion.predio ADD COLUMN archivado boolean NOT NULL DEFAULT false,
 ADD COLUMN motivo_archivo text, ADD COLUMN archivo_fecha timestamptz,
 ADD COLUMN archivo_usuario uuid REFERENCES gestion.usuario(id);
CREATE FUNCTION gestion.proteger_predio_archivado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid; cerrado boolean;
BEGIN
 IF TG_TABLE_NAME='entrega' THEN SELECT predio_id INTO pid FROM gestion.participacion WHERE id=NEW.participacion_id;
 ELSE pid:=NEW.predio_id; END IF;
 SELECT archivado INTO cerrado FROM gestion.predio WHERE id=pid FOR SHARE;
 IF cerrado THEN RAISE EXCEPTION 'Predio archivado: no admite nuevas operaciones' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER archivo_vinculo BEFORE INSERT ON gestion.vinculo FOR EACH ROW EXECUTE FUNCTION gestion.proteger_predio_archivado();
CREATE TRIGGER archivo_asignacion BEFORE INSERT ON gestion.asignacion FOR EACH ROW EXECUTE FUNCTION gestion.proteger_predio_archivado();
CREATE TRIGGER archivo_participacion BEFORE INSERT ON gestion.participacion FOR EACH ROW EXECUTE FUNCTION gestion.proteger_predio_archivado();
CREATE TRIGGER archivo_entrega BEFORE INSERT ON gestion.entrega FOR EACH ROW EXECUTE FUNCTION gestion.proteger_predio_archivado();
