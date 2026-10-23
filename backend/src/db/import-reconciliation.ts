import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pool } from './pool.js';

const bytes = await readFile(
  new URL('../../../database/municipal/cad-reconciliation.json.gz', import.meta.url),
);
const text = gunzipSync(bytes).toString('utf8');
const data = JSON.parse(text);
const hash = createHash('sha256').update(text).digest('hex');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-migrations'))");
  for (const r of data.routes) {
    await client.query(
      `INSERT INTO rutas(id,codigo,nombre,servicio_id,geom,is_demo,color,origen,metadata,geom_original)
      VALUES($1,$2,$3,$4,ST_SetSRID(ST_GeomFromGeoJSON($5),4326),false,$6,'cad-reconciliation-v1',$7,
      ST_SetSRID(ST_GeomFromGeoJSON($8),32717))
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,geom=excluded.geom,color=excluded.color,
      metadata=excluded.metadata,geom_original=excluded.geom_original`,
      [
        r.id,
        r.codigo,
        r.nombre,
        r.servicioId,
        JSON.stringify(r.geometry),
        r.color,
        r.metadata,
        JSON.stringify(r.originalGeometry),
      ],
    );
  }
  for (let i = 0; i < data.features.length; i += 1000) {
    await client.query(
      `WITH f AS (SELECT x->'properties' p,x->'geometry' g,x->'originalGeometry' o
      FROM jsonb_array_elements($1::jsonb) x)
      INSERT INTO cad_review(id,source,layer,properties,geom_original,geom,dataset_hash)
      SELECT p->>'id',p->>'source',p->>'layer',p,ST_SetSRID(ST_GeomFromGeoJSON(o),0),
        CASE WHEN g<>'null'::jsonb THEN ST_SetSRID(ST_GeomFromGeoJSON(g),4326) END,$2 FROM f
      ON CONFLICT(id) DO UPDATE SET properties=excluded.properties,geom=excluded.geom,
        geom_original=excluded.geom_original,dataset_hash=excluded.dataset_hash
      WHERE cad_review.dataset_hash<>excluded.dataset_hash`,
      [JSON.stringify(data.features.slice(i, i + 1000)), hash],
    );
  }
  for (const f of data.symbols) {
    const { originalGeometry, ...p } = f.properties;
    await client.query(
      `INSERT INTO municipal_cartography(id,kind,properties,geom_original,geom,is_valid,dataset_hash)
      VALUES($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),32717),ST_SetSRID(ST_GeomFromGeoJSON($5),4326),true,$6)
      ON CONFLICT(id) DO UPDATE SET properties=excluded.properties,geom=excluded.geom,dataset_hash=excluded.dataset_hash`,
      [p.id, p.kind, p, JSON.stringify(originalGeometry), JSON.stringify(f.geometry), hash],
    );
  }
  await client.query(
    `INSERT INTO municipal_imports(dataset,checksum,manifest) VALUES('cad-reconciliation-v1',$1,$2)
    ON CONFLICT(dataset) DO UPDATE SET checksum=$1,manifest=$2,imported_at=now()`,
    [hash, data.audit],
  );
  await client.query('COMMIT');
  console.log(
    `Conciliación: ${data.routes.length} ruta, ${data.symbols.length} flechas, ${data.features.length} geometrías de seis DWG. Sin eliminar datos anteriores.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
