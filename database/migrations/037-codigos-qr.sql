-- BAGUA MASTER: códigos QR de los predios (stickers en la puerta).
-- El QR solo lleva un código opaco de 8 caracteres en base32 de Crockford (7 aleatorios + 1 de
-- control): sin datos personales. Quien lo escanea sin sesión ve el horario de recolección de ese
-- punto; un promotor con sesión registra la visita. Un sticker perdido o dañado se revoca y se
-- genera otro; nunca se borra.
CREATE TABLE gestion.codigo_qr (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  predio_id uuid NOT NULL REFERENCES gestion.predio (id),
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'revocado')),
  generado_por uuid NOT NULL REFERENCES gestion.usuario (id),
  generado_en timestamptz NOT NULL DEFAULT now(),
  revocado_por uuid REFERENCES gestion.usuario (id),
  revocado_en timestamptz,
  motivo_revocacion text,
  escaneos integer NOT NULL DEFAULT 0 CHECK (escaneos >= 0),
  ultimo_escaneo timestamptz,
  CHECK ((estado = 'revocado') = (revocado_en IS NOT NULL)),
  CHECK (estado = 'activo' OR (revocado_por IS NOT NULL AND length(trim(motivo_revocacion)) >= 5))
);
-- Un solo código vigente por predio.
CREATE UNIQUE INDEX codigo_qr_activo ON gestion.codigo_qr (predio_id) WHERE estado = 'activo';

-- Cómo se identificó al participante al registrar la visita.
ALTER TABLE gestion.visita
  ADD COLUMN origen text NOT NULL DEFAULT 'lista' CHECK (origen IN ('lista', 'qr', 'codigo'));
