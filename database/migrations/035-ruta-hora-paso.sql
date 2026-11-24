-- BAGUA MASTER: tiempos de paso documentados en el plano municipal «RUTAS CON TIEMPO.dwg».
-- Cada rótulo de hora (p. ej. «07:42») se asocia a la ruta más cercana de ese mismo plano y se
-- traslada con el ajuste de coherencia de esa ruta, para quedar sobre su trazo. Son datos
-- documentales del plano (no sintéticos); su vigencia operativa la valida la Gerencia.
CREATE TABLE bagua_master.ruta_hora_paso (
  id text PRIMARY KEY,
  ruta_codigo text NOT NULL,
  hora time NOT NULL,
  distancia_trazo_m numeric(6, 1) NOT NULL,
  fuente_archivo text NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);
CREATE INDEX ruta_hora_paso_ruta ON bagua_master.ruta_hora_paso (ruta_codigo);
CREATE INDEX ruta_hora_paso_geom ON bagua_master.ruta_hora_paso USING gist (geom);
