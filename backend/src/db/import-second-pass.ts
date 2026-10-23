import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pool } from './pool.js';

// Second-pass DWG layers: review evidence only. Touches cad_second_pass and its
// municipal_imports row; never routes, cartography, CAD staging or DEMO data.
const buffer = await readFile(
  new URL('../../../database/municipal/segunda-pasada.json.gz', import.meta.url),
);
const text = gunzipSync(buffer).toString('utf8');
const data = JSON.parse(text);
const hash = createHash('sha256').update(text).digest('hex');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-migrations'))");
  const table = await client.query("SELECT to_regclass('cad_second_pass') AS name");
  if (!table.rows[0].name)
    throw new Error('Falta la migración 004-cad-second-pass.sql. Ejecute npm run db:migrate.');
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < data.features.length; i += 2000) {
    const batch = data.features.slice(i, i + 2000);
    const result = await client.query(
      `WITH f AS (
        SELECT x->'properties' AS p,
          ST_SetSRID(ST_GeomFromGeoJSON(x->'properties'->'originalGeometry'),32717) AS original,
          ST_SetSRID(ST_GeomFromGeoJSON(x->'geometry'),4326) AS geographic
        FROM jsonb_array_elements($1::jsonb) x
      ) INSERT INTO cad_second_pass(id,kind,status,review_note,source,crs,crs_status,offset_e,
          offset_n,properties,geom_original,geom,is_valid,validity_reason,dataset_hash)
        SELECT p->>'id',p->>'kind',p->>'status',p->>'reviewNote',p->>'source',p->>'crs',
          p->>'crsStatus',(p->'offset'->>0)::float8,(p->'offset'->>1)::float8,p->'attributes',
          original,geographic,ST_IsValid(geographic),
          CASE WHEN NOT ST_IsValid(geographic) THEN ST_IsValidReason(geographic) END,$2 FROM f
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status=excluded.status,
          review_note=excluded.review_note,source=excluded.source,crs=excluded.crs,
          crs_status=excluded.crs_status,offset_e=excluded.offset_e,offset_n=excluded.offset_n,
          properties=excluded.properties,geom_original=excluded.geom_original,geom=excluded.geom,
          is_valid=excluded.is_valid,validity_reason=excluded.validity_reason,
          dataset_hash=excluded.dataset_hash
        WHERE cad_second_pass.dataset_hash<>excluded.dataset_hash
        RETURNING (xmax = 0) AS inserted`,
      [JSON.stringify(batch), hash],
    );
    for (const row of result.rows) {
      if (row.inserted) inserted++;
      else updated++;
    }
  }
  // Rows of an earlier package that no longer exist in this one.
  const removed = await client.query('DELETE FROM cad_second_pass WHERE dataset_hash<>$1', [hash]);
  await client.query(
    `INSERT INTO municipal_imports(dataset,checksum,manifest)
    VALUES ('cad-second-pass-v1',$1,$2) ON CONFLICT(dataset) DO UPDATE SET checksum=$1,manifest=$2,
      imported_at=CASE WHEN municipal_imports.checksum=$1 THEN municipal_imports.imported_at ELSE now() END`,
    [hash, data.audit],
  );
  const counts = await client.query(
    'SELECT kind,count(*)::int AS total FROM cad_second_pass GROUP BY kind ORDER BY kind',
  );
  await client.query('COMMIT');
  console.log(
    `Segunda pasada DWG: ${data.features.length} elementos en el paquete; ` +
      `${inserted} nuevos, ${updated} actualizados, ${removed.rowCount} retirados.`,
  );
  for (const row of counts.rows) console.log(`  ${row.kind}: ${row.total}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
