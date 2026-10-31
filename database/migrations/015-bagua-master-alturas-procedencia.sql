-- Soporta fuentes con año de referencia sin atribuirles un día de adquisición.
ALTER TABLE bagua_master.altura_estimada
  ADD COLUMN fecha_precision text NOT NULL DEFAULT 'dia' CHECK (fecha_precision IN ('dia','anio')),
  ADD COLUMN licencia text NOT NULL DEFAULT 'CC BY 4.0';
