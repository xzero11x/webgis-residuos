-- Dominio administrativo nuevo. No modifica Overture ni el DEMO del visor histórico.
CREATE SCHEMA gestion;
CREATE TABLE gestion.usuario (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL,
 usuario text NOT NULL UNIQUE, password_hash text NOT NULL,
 rol text NOT NULL CHECK (rol IN ('administrador','registro','consulta')),
 activo boolean NOT NULL DEFAULT true, creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gestion.sesion (
 token_hash text PRIMARY KEY, usuario_id uuid NOT NULL REFERENCES gestion.usuario(id),
 expira_en timestamptz NOT NULL, creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON gestion.sesion(expira_en);
CREATE TABLE gestion.fuente (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE,
 nombre text NOT NULL, sintetica boolean NOT NULL DEFAULT true CHECK(sintetica),
 creado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gestion.fuente(codigo,nombre) VALUES ('SINTETICO-LOCAL-V1','Pruebas sintéticas de BAGUA MASTER; sin padrón municipal');
CREATE TABLE gestion.predio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fuente_id uuid NOT NULL REFERENCES gestion.fuente(id),
 codigo text NOT NULL, direccion text NOT NULL, sector text,
 uso text, observaciones text NOT NULL DEFAULT '',
 ubicacion jsonb, evidencia_ubicacion text NOT NULL DEFAULT '',
 estado_ubicacion text NOT NULL DEFAULT 'pendiente' CHECK(estado_ubicacion IN ('pendiente','aproximada','verificada','conflictiva')),
 version integer NOT NULL DEFAULT 1, creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(fuente_id,codigo),
 CHECK ((ubicacion IS NULL AND estado_ubicacion IN ('pendiente','conflictiva')) OR
        (ubicacion IS NOT NULL AND estado_ubicacion IN ('aproximada','verificada') AND length(trim(evidencia_ubicacion))>0))
);
CREATE INDEX ON gestion.predio(lower(codigo));
CREATE TABLE gestion.persona (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fuente_id uuid NOT NULL REFERENCES gestion.fuente(id),
 codigo text NOT NULL, nombre text NOT NULL, tipo text NOT NULL CHECK(tipo IN ('natural','juridica')),
 UNIQUE(fuente_id,codigo)
);
CREATE TABLE gestion.vinculo (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), predio_id uuid NOT NULL REFERENCES gestion.predio(id),
 persona_id uuid NOT NULL REFERENCES gestion.persona(id), tipo text NOT NULL,
 desde date NOT NULL, hasta date, evidencia text NOT NULL,
 CHECK(hasta IS NULL OR hasta>=desde), UNIQUE(predio_id,persona_id,tipo,desde)
);
CREATE TABLE gestion.servicio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE, nombre text NOT NULL,
 sintetico boolean NOT NULL DEFAULT true CHECK(sintetico)
);
INSERT INTO gestion.servicio(codigo,nombre) VALUES
 ('PRUEBA-CONV','Convencional · catálogo de prueba'),
 ('PRUEBA-ORG','Orgánicos · catálogo de prueba'),
 ('PRUEBA-APR','Aprovechables · catálogo de prueba');
CREATE TABLE gestion.asignacion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), predio_id uuid NOT NULL REFERENCES gestion.predio(id),
 servicio_id uuid NOT NULL REFERENCES gestion.servicio(id), desde date NOT NULL, hasta date,
 estado text NOT NULL CHECK(estado IN ('prevista','pendiente','confirmada')), evidencia text NOT NULL,
 CHECK(hasta IS NULL OR hasta>=desde), UNIQUE(predio_id,servicio_id,desde)
);
CREATE TABLE gestion.participacion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), predio_id uuid NOT NULL REFERENCES gestion.predio(id),
 servicio_id uuid NOT NULL REFERENCES gestion.servicio(id), desde date NOT NULL, hasta date,
 evidencia text NOT NULL, CHECK(hasta IS NULL OR hasta>=desde), UNIQUE(predio_id,servicio_id,desde)
);
CREATE TABLE gestion.entrega (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participacion_id uuid NOT NULL REFERENCES gestion.participacion(id),
 fecha date NOT NULL, material text NOT NULL, cantidad numeric, unidad text,
 observaciones text NOT NULL DEFAULT '', responsable_id uuid NOT NULL REFERENCES gestion.usuario(id),
 clave uuid NOT NULL UNIQUE, anulada boolean NOT NULL DEFAULT false, motivo_anulacion text,
 creado_en timestamptz NOT NULL DEFAULT now(),
 CHECK ((cantidad IS NULL AND unidad IS NULL) OR (cantidad>0 AND unidad IN ('kg','unidad')))
);
CREATE TABLE gestion.historial (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, predio_id uuid REFERENCES gestion.predio(id),
 usuario_id uuid NOT NULL REFERENCES gestion.usuario(id), accion text NOT NULL,
 anterior jsonb, nuevo jsonb, creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON gestion.historial(predio_id,creado_en DESC);
CREATE TABLE gestion.importacion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), huella text NOT NULL UNIQUE,
 usuario_id uuid NOT NULL REFERENCES gestion.usuario(id), contenido jsonb NOT NULL,
 estado text NOT NULL DEFAULT 'validada' CHECK(estado IN ('validada','aplicada')),
 creado_en timestamptz NOT NULL DEFAULT now(), aplicado_en timestamptz
);
COMMENT ON SCHEMA gestion IS 'BAGUA MASTER: gestión con fuentes sintéticas hasta habilitación institucional explícita. No deriva predios de edificios.';
