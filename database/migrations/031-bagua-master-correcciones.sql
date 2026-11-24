-- BAGUA MASTER: correcciones cartográficas locales sobre los datos abiertos.
-- Las hace quien conoce Bagua (p. ej. mirando la ciudad o una referencia visual) y se aplican
-- ENCIMA de Overture y de la capa complementaria: nunca modifican esas tablas, así que sobreviven
-- a una nueva importación. No contienen datos personales; el autor se guarda para auditoría y
-- no se publica en el mapa.
CREATE TABLE bagua_master.correccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla text NOT NULL CHECK (tabla IN ('lugar', 'edificio', 'edificio_complemento')),
  elemento_id text,
  accion text NOT NULL CHECK (accion IN ('ocultar', 'mover', 'agregar')),
  geom geometry(Geometry, 4326),
  nombre text CHECK (nombre IS NULL OR char_length(nombre) BETWEEN 1 AND 120),
  motivo text NOT NULL CHECK (char_length(motivo) BETWEEN 3 AND 500),
  usuario_id uuid NOT NULL REFERENCES gestion.usuario(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  anulada_en timestamptz,
  anulada_por uuid REFERENCES gestion.usuario(id),
  CONSTRAINT correccion_forma CHECK (
    (accion = 'ocultar' AND elemento_id IS NOT NULL AND geom IS NULL)
    OR (accion = 'mover' AND tabla = 'lugar' AND elemento_id IS NOT NULL
        AND GeometryType(geom) = 'POINT')
    OR (accion = 'agregar' AND tabla = 'edificio' AND elemento_id IS NULL
        AND GeometryType(geom) = 'POLYGON')
  ),
  CONSTRAINT correccion_anulacion CHECK ((anulada_en IS NULL) = (anulada_por IS NULL))
);
-- Una sola corrección vigente por elemento y acción (anular y volver a corregir es posible).
CREATE UNIQUE INDEX correccion_vigente ON bagua_master.correccion (tabla, elemento_id, accion)
  WHERE anulada_en IS NULL AND elemento_id IS NOT NULL;
CREATE INDEX correccion_geom ON bagua_master.correccion USING gist (geom);
COMMENT ON TABLE bagua_master.correccion IS
  'Correcciones cartográficas locales (ocultar, mover un lugar, agregar una edificación). Se anulan, no se borran.';
