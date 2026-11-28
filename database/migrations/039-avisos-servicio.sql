-- BAGUA MASTER: avisos del servicio y cambios de programación.
-- Un cambio de horario o una suspensión (feriado, avería, lluvia) solo sirve si llega a quien lo
-- necesita: el vecino lo ve al escanear el sticker o consultar su punto, el chofer en su ruta del
-- día y el promotor en su recorrido. Cada cambio de programación queda con su motivo, su autor y la
-- fecha desde la que rige; nunca se borra.

CREATE TABLE bagua_master.aviso_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('suspension', 'cambio_horario', 'informativo')),
  titulo text NOT NULL CHECK (length(trim(titulo)) BETWEEN 5 AND 120),
  mensaje text NOT NULL CHECK (length(trim(mensaje)) BETWEEN 5 AND 600),
  -- Programaciones afectadas; vacío = todo el servicio.
  programaciones text[] NOT NULL DEFAULT '{}',
  desde date NOT NULL,
  hasta date NOT NULL,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'simulacion')),
  publicado_por uuid REFERENCES gestion.usuario (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  retirado boolean NOT NULL DEFAULT false,
  motivo_retiro text,
  CHECK (hasta >= desde),
  CHECK (NOT retirado OR length(trim(motivo_retiro)) >= 5)
);
CREATE INDEX aviso_servicio_vigencia ON bagua_master.aviso_servicio (desde, hasta) WHERE NOT retirado;

CREATE TABLE bagua_master.ruta_programacion_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programacion_id text NOT NULL,
  anterior jsonb NOT NULL,
  nuevo jsonb NOT NULL,
  motivo text NOT NULL CHECK (length(trim(motivo)) >= 5),
  desde date NOT NULL,
  aviso_id uuid REFERENCES bagua_master.aviso_servicio (id),
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'simulacion')),
  usuario_id uuid REFERENCES gestion.usuario (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ruta_programacion_cambio_prog ON bagua_master.ruta_programacion_cambio (programacion_id, creado_en);
