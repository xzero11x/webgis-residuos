-- NULL significa ausencia de medición. Evitar que CHECK acepte UNKNOWN por SQL NULL.
ALTER TABLE gestion.entrega ADD CONSTRAINT entrega_medicion_completa CHECK (
  (cantidad IS NULL AND unidad IS NULL) OR
  (cantidad IS NOT NULL AND unidad IS NOT NULL AND cantidad>0 AND unidad IN ('kg','unidad'))
);
