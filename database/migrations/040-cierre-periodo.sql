-- BAGUA MASTER: cierre mensual de la operación.
-- Al cerrar un mes se guarda la foto de sus cifras (toneladas, rutas, participación, valorización)
-- y desde entonces no se registran ni corrigen visitas, rutas, pesajes ni comprobantes con fecha en
-- ese mes. Un cierre se puede reabrir con motivo; queda el historial de ambos actos.

CREATE TABLE gestion.periodo_cierre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo date NOT NULL CHECK (extract(day FROM periodo) = 1),
  cerrado_por uuid NOT NULL REFERENCES gestion.usuario (id),
  cerrado_en timestamptz NOT NULL DEFAULT now(),
  resumen jsonb NOT NULL,
  observaciones text NOT NULL DEFAULT '',
  reabierto_por uuid REFERENCES gestion.usuario (id),
  reabierto_en timestamptz,
  motivo_reapertura text,
  CHECK ((reabierto_en IS NULL) = (reabierto_por IS NULL)),
  CHECK (reabierto_en IS NULL OR length(trim(motivo_reapertura)) >= 5)
);
CREATE UNIQUE INDEX periodo_cierre_vigente ON gestion.periodo_cierre (periodo) WHERE reabierto_en IS NULL;
