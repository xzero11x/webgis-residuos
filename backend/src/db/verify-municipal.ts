import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';

// Read-only checks on municipal data. The OSM comparison uses a temporary table.
const client = await pool.connect();
try {
  const roads = JSON.parse(
    await readFile(
      new URL('../../../database/municipal/osm-reference.json', import.meta.url),
      'utf8',
    ),
  );
  await client.query('BEGIN');
  await client.query(
    'CREATE TEMP TABLE qa_roads(id text,geom geometry(LineString,32717)) ON COMMIT DROP',
  );
  await client.query(
    `INSERT INTO qa_roads SELECT f->'properties'->>'osmId',
    ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(f->'geometry'),4326),32717)
    FROM jsonb_array_elements($1::jsonb) f`,
    [JSON.stringify(roads.features)],
  );
  await client.query('CREATE INDEX ON qa_roads USING gist(geom)');
  const routes =
    await client.query(`SELECT codigo,metadata->>'status' AS status,ST_IsValid(geom) AS valid,
    ST_SRID(geom) AS srid,ST_NumGeometries(geom) AS components,
    round(ST_Length(ST_Transform(geom,32717))::numeric,1)::float AS length_m
    FROM rutas WHERE origen='municipal-cad-v1' ORDER BY codigo`);
  const distances = await client.query(`WITH segments AS (
    SELECT codigo,(ST_Dump(ST_Transform(geom,32717))).geom AS geom FROM rutas WHERE origen='municipal-cad-v1'),
    samples AS (SELECT codigo,ST_LineInterpolatePoint(geom,LEAST(1.0,i*20.0/NULLIF(ST_Length(geom),0))) AS geom
      FROM segments CROSS JOIN LATERAL generate_series(0,FLOOR(ST_Length(geom)/20)::int) i),
    distances AS (SELECT s.codigo,ST_Distance(s.geom,n.geom) AS distance_m FROM samples s
      CROSS JOIN LATERAL (SELECT geom FROM qa_roads ORDER BY geom <-> s.geom LIMIT 1) n)
    SELECT codigo,count(*)::int AS samples,round(avg(distance_m)::numeric,1)::float AS mean_m,
      round(percentile_cont(0.5) WITHIN GROUP(ORDER BY distance_m)::numeric,1)::float AS median_m,
      round(percentile_cont(0.95) WITHIN GROUP(ORDER BY distance_m)::numeric,1)::float AS p95_m,
      round(100.0*count(*) FILTER(WHERE distance_m<=15)/count(*),1)::float AS percent_within_15m
      FROM distances GROUP BY codigo ORDER BY codigo`);
  const entities =
    await client.query(`SELECT count(*)::int AS total,count(geom)::int AS georeferenced,
    count(*) FILTER(WHERE source_srid IS NULL)::int AS crs_pending,
    count(*) FILTER(WHERE is_valid=false)::int AS invalid_retained,
    count(*) FILTER(WHERE NOT in_study_area AND geom_original IS NOT NULL)::int AS outside_study_area
    FROM cad_features`);
  const demo = await client.query('SELECT count(*)::int AS predios FROM predios WHERE is_demo');
  await client.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        routes: routes.rows,
        osmComparison: distances.rows,
        osmSource: roads.source,
        osmAttribution: roads.attribution,
        entities: entities.rows[0],
        demo: demo.rows[0],
        interpretation:
          'Distancia al eje vial OSM más próximo, muestreo cada 20 m por componente. OSM es referencia, no verdad topográfica. No se ha ajustado ni desplazado ninguna ruta.',
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
