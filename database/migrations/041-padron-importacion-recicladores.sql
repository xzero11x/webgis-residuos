-- BAGUA MASTER: carga del padrón real, empadronamiento en campo y recicladores formalizados.
--   * Importación del padrón desde el Excel de la Gerencia: cada lote guarda el archivo (huella),
--     el programa, lo creado y lo actualizado, y se puede revertir mientras no tenga visitas.
--   * Consentimiento al empadronar (Ley 29733): fecha y versión del texto que la persona aceptó.
--   * Organizaciones de recicladores (Ley 29419 y DS 005-2010-MINAM): RUC, registro municipal con
--     vigencia y padrón de socios con carnet, capacitación, vacunas y equipo de protección.

CREATE TABLE gestion.importacion_padron (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  servicio_codigo text NOT NULL,
  tipo_generador text NOT NULL CHECK (tipo_generador IN ('domiciliario', 'no_domiciliario')),
  filas integer NOT NULL CHECK (filas > 0),
  resumen jsonb NOT NULL,
  creados jsonb NOT NULL DEFAULT '{}',
  usuario_id uuid NOT NULL REFERENCES gestion.usuario (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  revertido_en timestamptz,
  revertido_por uuid REFERENCES gestion.usuario (id),
  motivo_reversion text,
  CHECK ((revertido_en IS NULL) = (revertido_por IS NULL)),
  CHECK (revertido_en IS NULL OR length(trim(motivo_reversion)) >= 5)
);

ALTER TABLE gestion.participacion
  ADD COLUMN importacion_id uuid REFERENCES gestion.importacion_padron (id),
  ADD COLUMN consentimiento_en timestamptz,
  ADD COLUMN consentimiento_version text,
  ADD CONSTRAINT participacion_consentimiento CHECK ((consentimiento_en IS NULL) = (consentimiento_version IS NULL));

ALTER TABLE gestion.actor
  ADD COLUMN ruc text CHECK (ruc IS NULL OR ruc ~ '^(10|20)[0-9]{9}$'),
  ADD COLUMN registro_numero text,
  ADD COLUMN registro_desde date,
  ADD COLUMN registro_hasta date,
  ADD COLUMN representante text,
  ADD COLUMN zona text,
  ADD CONSTRAINT actor_registro_vigencia CHECK (registro_hasta IS NULL OR registro_desde IS NULL OR registro_hasta >= registro_desde);

CREATE TABLE gestion.reciclador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES gestion.actor (id),
  nombre text NOT NULL CHECK (length(trim(nombre)) >= 3),
  documento text CHECK (documento IS NULL OR documento ~ '^[0-9]{8}$'),
  carnet text,
  desde date NOT NULL,
  hasta date,
  capacitado boolean NOT NULL DEFAULT false,
  vacunado boolean NOT NULL DEFAULT false,
  epp boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta IS NULL OR hasta >= desde)
);
CREATE INDEX reciclador_actor ON gestion.reciclador (actor_id);
CREATE UNIQUE INDEX reciclador_carnet ON gestion.reciclador (carnet) WHERE carnet IS NOT NULL AND hasta IS NULL;
