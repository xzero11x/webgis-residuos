-- BAGUA MASTER: ¿qué servicios de recolección pasan por un punto y a qué hora, aproximadamente?
-- Para cada programación vigente cuya ruta pasa a menos de `radio_m` del punto:
--   1. Si el plano documenta tiempos de paso de esa ruta cerca (≤ 500 m) y dentro de la ventana de
--      su recolección convencional, se toma el más cercano y se lleva proporcionalmente a la
--      ventana de esta programación (base = 'plano').
--   2. Si no, se estima por la posición del punto a lo largo del recorrido (base = 'recorrido').
-- La hora se redondea a 5 minutos; es una referencia para el vecino, no un compromiso de paso.
CREATE FUNCTION bagua_master.recoleccion_en_punto(punto geometry, radio_m double precision DEFAULT 80)
RETURNS TABLE (
  programacion_id text, ruta_codigo text, ruta_nombre text, color text, servicio text, nombre text,
  dias smallint[], hora_inicio time, hora_fin time, turno text, operador text, vehiculo text,
  distancia_m numeric, hora_estimada time, base text
)
LANGUAGE sql STABLE AS $$
  SELECT g.id, g.ruta_codigo, r.nombre, r.color, g.servicio, g.nombre, g.dias, g.hora_inicio, g.hora_fin,
         g.turno, g.operador, g.vehiculo,
         round(ST_Distance(r.geom::geography, punto::geography)::numeric, 1),
         ('2000-01-01'::timestamp + make_interval(secs => round(extract(epoch FROM coalesce(
            CASE WHEN a.hora IS NOT NULL THEN
              g.hora_inicio + (a.hora - c.hora_inicio)
                * (extract(epoch FROM g.hora_fin - g.hora_inicio)
                   / nullif(extract(epoch FROM c.hora_fin - c.hora_inicio), 0))
            END,
            g.hora_inicio + (g.hora_fin - g.hora_inicio) * least(1, f.frac)
          )) / 300) * 300))::time,
         CASE WHEN a.hora IS NOT NULL THEN 'plano' ELSE 'recorrido' END
  FROM bagua_master.ruta_programacion g
  JOIN bagua_master.ruta r ON r.codigo = g.ruta_codigo
  LEFT JOIN LATERAL (
    SELECT c.hora_inicio, c.hora_fin FROM bagua_master.ruta_programacion c
    WHERE c.ruta_codigo = g.ruta_codigo AND c.servicio = 'convencional' AND c.vigente LIMIT 1
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT h.hora FROM bagua_master.ruta_hora_paso h
    WHERE h.ruta_codigo = g.ruta_codigo AND c.hora_inicio IS NOT NULL
      AND h.hora BETWEEN c.hora_inicio AND c.hora_fin
      AND ST_DWithin(h.geom::geography, punto::geography, 500)
    ORDER BY h.geom <-> punto LIMIT 1
  ) a ON true
  CROSS JOIN LATERAL (
    SELECT ST_Distance(punto, ST_StartPoint(ST_GeometryN(r.geom, 1)))
           / nullif(ST_MaxDistance(r.geom, ST_StartPoint(ST_GeometryN(r.geom, 1))), 0) AS frac
  ) f
  WHERE g.vigente AND ST_DWithin(r.geom::geography, punto::geography, radio_m)
  ORDER BY g.servicio, 13;
$$;
