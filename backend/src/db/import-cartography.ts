import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool } from './pool.js';

const buffer = await readFile(
  new URL('../../../database/municipal/cartography.json', import.meta.url),
);
const data = JSON.parse(buffer.toString('utf8'));
const hash = createHash('sha256').update(buffer).digest('hex');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-migrations'))");
  for (const f of data.features) {
    const { originalGeometry, ...properties } = f.properties;
    await client.query(
      `WITH g AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON($4),32717) AS original,
             ST_SetSRID(ST_GeomFromGeoJSON($5),4326) AS geographic
    ) INSERT INTO municipal_cartography(id,kind,properties,geom_original,geom,is_valid,validity_reason,dataset_hash)
      SELECT $1,$2,$3,original,CASE WHEN ST_IsValid(geographic) THEN geographic END,
             ST_IsValid(geographic),ST_IsValidReason(geographic),$6 FROM g
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,properties=excluded.properties,
        geom_original=excluded.geom_original,geom=excluded.geom,is_valid=excluded.is_valid,
        validity_reason=excluded.validity_reason,dataset_hash=excluded.dataset_hash`,
      [
        properties.id,
        properties.kind,
        properties,
        JSON.stringify(originalGeometry),
        JSON.stringify(f.geometry),
        hash,
      ],
    );
  }
  // This table contains only generated documentary interpretations, not operational edits.
  await client.query(
    "DELETE FROM municipal_cartography WHERE dataset_hash<>$1 AND id LIKE 'cad-symbol:%'",
    [hash],
  );
  await client.query(
    `INSERT INTO municipal_imports(dataset,checksum,manifest)
    VALUES ('cartography-v1',$1,$2) ON CONFLICT(dataset) DO UPDATE SET checksum=$1,manifest=$2,imported_at=now()`,
    [hash, data.audit],
  );
  await client.query(`UPDATE rutas SET color=CASE codigo WHEN 'MUN-1001' THEN '#2457d6'
    WHEN 'MUN-2001' THEN '#b82c9a' WHEN 'MUN-2002' THEN '#e87925'
    WHEN 'CAD-PRIMAVERA' THEN '#079d99' ELSE color END WHERE NOT is_demo`);
  await client.query('COMMIT');
  console.log(`Cartografía documental importada: ${data.features.length} elementos.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
