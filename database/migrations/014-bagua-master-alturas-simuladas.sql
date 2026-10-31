-- Completa exclusivamente la representación visual; nunca modifica alturas satelitales.
CREATE TABLE bagua_master.altura_simulada (
  edificio_id text PRIMARY KEY REFERENCES bagua_master.edificio(id) ON DELETE CASCADE,
  altura_m double precision NOT NULL CHECK (altura_m BETWEEN 2.7 AND 18),
  metodo text NOT NULL,
  semilla text NOT NULL,
  vecinos integer NOT NULL CHECK (vecinos >= 0),
  referencia_m double precision NOT NULL CHECK (referencia_m > 0),
  ghsl_m double precision,
  generado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bagua_master.altura_simulada IS
  'SIMULACIÓN para visualización: alturas aleatorias reproducibles, condicionadas por vecindario, huellas comparables y GHSL. No son observaciones ni datos catastrales.';
