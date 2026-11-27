-- BAGUA MASTER: ejecución de las rutas de recolección y pesaje en el destino.
--   * Vehículos del servicio, con su tara para el ticket de la balanza.
--   * Puntos de control de cada programación: lugares del recorrido, en orden, con la hora a la que
--     el vehículo debería pasar (tomada de los tiempos de paso del plano cuando existen).
--   * Ejecución de la ruta desde el celular del chofer: salida, paso por los puntos de control y
--     llegada al destino (relleno, planta de compostaje o centro de acopio), con la hora y la
--     posición del teléfono. Cada registro lleva una clave única para enviarse sin conexión.
--   * Pesaje: el ticket de la balanza se registra en la oficina (peso bruto, tara y neto por viaje).
-- Con esto, la hora real de paso alimenta el horario que ve el vecino, el tablero del supervisor y
-- las toneladas del reporte.

CREATE TABLE gestion.vehiculo (
  placa text PRIMARY KEY CHECK (placa ~ '^[A-Z0-9-]{4,10}$'),
  descripcion text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('compactadora', 'volquete', 'motofurgon', 'camioneta')),
  capacidad_m3 numeric(5, 1) CHECK (capacidad_m3 IS NULL OR capacidad_m3 > 0),
  tara_kg numeric(8, 1) CHECK (tara_kg IS NULL OR tara_kg > 0),
  anio smallint CHECK (anio IS NULL OR anio BETWEEN 1980 AND 2100),
  activo boolean NOT NULL DEFAULT true,
  sintetico boolean NOT NULL DEFAULT true CHECK (sintetico)
);

ALTER TABLE bagua_master.ruta_programacion ADD COLUMN vehiculo_placa text;

CREATE TABLE bagua_master.ruta_punto_control (
  id text PRIMARY KEY,
  programacion_id text NOT NULL,
  orden smallint NOT NULL CHECK (orden >= 1),
  nombre text NOT NULL,
  hora_programada time NOT NULL,
  base text NOT NULL CHECK (base IN ('plano', 'recorrido')),
  geom geometry(Point, 4326) NOT NULL,
  sintetico boolean NOT NULL DEFAULT true CHECK (sintetico),
  UNIQUE (programacion_id, orden)
);
CREATE INDEX ruta_punto_control_geom ON bagua_master.ruta_punto_control USING gist (geom);

CREATE TABLE gestion.ruta_ejecucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programacion_id text NOT NULL,
  ruta_codigo text NOT NULL,
  servicio text NOT NULL CHECK (servicio IN ('convencional', 'organicos', 'reciclables', 'comercial')),
  fecha date NOT NULL,
  vehiculo text NOT NULL DEFAULT '',
  conductor_id uuid NOT NULL REFERENCES gestion.usuario (id),
  estado text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'completada', 'interrumpida')),
  motivo_interrupcion text,
  clave uuid NOT NULL UNIQUE,
  anulada boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT anulada OR length(trim(motivo_anulacion)) >= 5),
  CHECK (estado <> 'interrumpida' OR length(trim(motivo_interrupcion)) >= 3)
);
-- Una sola ejecución vigente por programación y día.
CREATE UNIQUE INDEX ruta_ejecucion_unica ON gestion.ruta_ejecucion (programacion_id, fecha) WHERE NOT anulada;
CREATE INDEX ruta_ejecucion_fecha ON gestion.ruta_ejecucion (fecha);

CREATE TABLE gestion.ruta_evento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_id uuid NOT NULL REFERENCES gestion.ruta_ejecucion (id),
  tipo text NOT NULL CHECK (tipo IN ('salida', 'paso', 'llegada')),
  -- Hora en que el chofer tocó el botón (la del celular); registrado_en es la hora del servidor.
  momento timestamptz NOT NULL,
  punto_id text,
  destino text CHECK (destino IN ('relleno', 'planta', 'acopio')),
  geom geometry(Point, 4326),
  precision_m real CHECK (precision_m IS NULL OR precision_m >= 0),
  nota text NOT NULL DEFAULT '',
  clave uuid NOT NULL UNIQUE,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'llegada') = (destino IS NOT NULL)),
  CHECK (tipo = 'paso' OR punto_id IS NULL)
);
CREATE INDEX ruta_evento_ejecucion ON gestion.ruta_evento (ejecucion_id, momento);
CREATE INDEX ruta_evento_punto ON gestion.ruta_evento (punto_id) WHERE punto_id IS NOT NULL;

CREATE TABLE gestion.pesaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_id uuid REFERENCES gestion.ruta_ejecucion (id),
  destino text NOT NULL DEFAULT 'relleno' CHECK (destino IN ('relleno', 'planta', 'acopio')),
  fecha date NOT NULL,
  hora time,
  ticket text NOT NULL CHECK (length(trim(ticket)) >= 2),
  vehiculo text NOT NULL,
  peso_bruto_kg numeric(9, 1) NOT NULL CHECK (peso_bruto_kg > 0),
  tara_kg numeric(9, 1) NOT NULL CHECK (tara_kg >= 0),
  peso_neto_kg numeric(9, 1) GENERATED ALWAYS AS (peso_bruto_kg - tara_kg) STORED,
  observaciones text NOT NULL DEFAULT '',
  registrado_por uuid NOT NULL REFERENCES gestion.usuario (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  CHECK (peso_bruto_kg > tara_kg),
  CHECK (NOT anulado OR length(trim(motivo_anulacion)) >= 5)
);
CREATE UNIQUE INDEX pesaje_ticket ON gestion.pesaje (destino, ticket) WHERE NOT anulado;
CREATE INDEX pesaje_fecha ON gestion.pesaje (fecha);
CREATE INDEX pesaje_ejecucion ON gestion.pesaje (ejecucion_id);

-- Atraso habitual del vehículo cerca de un punto: mediana, en las últimas `semanas`, de la diferencia
-- entre la hora real de paso por el punto de control más cercano (≤ 800 m) y su hora programada.
-- Sirve para decirle al vecino a qué hora pasa de verdad, no solo a qué hora debería pasar.
CREATE FUNCTION bagua_master.atraso_habitual(p_programacion text, punto geometry, semanas integer DEFAULT 8)
RETURNS TABLE (punto_id text, minutos integer, recorridos integer)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT pc.id, pc.hora_programada FROM bagua_master.ruta_punto_control pc
    WHERE pc.programacion_id = p_programacion AND ST_DWithin(pc.geom::geography, punto::geography, 800)
    ORDER BY pc.geom <-> punto LIMIT 1
  ), obs AS (
    SELECT DISTINCT ON (e.id)
           extract(epoch FROM (ev.momento AT TIME ZONE 'America/Lima')::time - c.hora_programada) / 60 AS m
    FROM c
    JOIN gestion.ruta_evento ev ON ev.punto_id = c.id AND ev.tipo = 'paso'
    JOIN gestion.ruta_ejecucion e ON e.id = ev.ejecucion_id AND NOT e.anulada
    WHERE e.fecha >= (now() AT TIME ZONE 'America/Lima')::date - 7 * semanas
    ORDER BY e.id, ev.momento
  )
  SELECT (SELECT id FROM c), round(percentile_cont(0.5) WITHIN GROUP (ORDER BY m))::integer, count(*)::integer
  FROM obs HAVING count(*) > 0;
$$;
