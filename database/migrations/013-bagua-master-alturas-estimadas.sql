-- Alturas derivadas independientes: nunca sustituyen atributos originales de Overture.
CREATE TABLE bagua_master.altura_estimada (
  edificio_id text PRIMARY KEY REFERENCES bagua_master.edificio(id) ON DELETE CASCADE,
  altura_m double precision NOT NULL CHECK (altura_m > 0 AND altura_m <= 100),
  cobertura double precision NOT NULL CHECK (cobertura >= 0.5 AND cobertura <= 1),
  muestras integer NOT NULL CHECK (muestras >= 4),
  fuente text NOT NULL,
  fecha date NOT NULL,
  metodo text NOT NULL,
  tesela text NOT NULL,
  importado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bagua_master.altura_estimada IS
  'Alturas satelitales estimadas sobre el terreno. No son mediciones catastrales ni número de pisos.';
