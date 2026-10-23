import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import type { PoolClient } from 'pg';

export async function importMunicipal(client: PoolClient, directory: URL) {
  const manifestFile = new URL('municipal/manifest.json', directory);
  const bytes = await readFile(manifestFile);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const data = JSON.parse(bytes.toString('utf8'));
  if (data.version !== 1) throw new Error('Versión del paquete municipal no compatible.');
  const entityFile = new URL('municipal/cad-entities.jsonl.gz', directory);
  const entityChecksum = createHash('sha256')
    .update(await readFile(entityFile))
    .digest('hex');
  if (entityChecksum !== data.cadPackageSha256)
    throw new Error('El archivo de entidades no coincide con la huella del paquete municipal.');
  const previous = await client.query(
    "SELECT checksum FROM municipal_imports WHERE dataset='municipal-cad-v1'",
  );
  if (previous.rows[0]?.checksum === checksum) {
    console.log('Importación municipal idéntica: se conservan los datos existentes.');
    return;
  }
  await client.query('BEGIN');
  try {
    for (const service of data.services)
      await client.query(
        `INSERT INTO servicios(id,nombre,color,is_demo) VALUES($1,$2,$3,false)
         ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,color=EXCLUDED.color`,
        [service.id, service.nombre, service.color],
      );
    for (const route of data.routes)
      await client.query(
        `INSERT INTO rutas(id,codigo,nombre,servicio_id,horario,frecuencia,geom,is_demo,color,origen,metadata,geom_original)
         VALUES($1,$2,$3,$4,NULL,NULL,ST_SetSRID(ST_GeomFromGeoJSON($5),4326),false,$6,'municipal-cad-v1',$7,
         ST_SetSRID(ST_GeomFromGeoJSON($8),32717))
         ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,geom=EXCLUDED.geom,color=EXCLUDED.color,
         metadata=EXCLUDED.metadata,geom_original=EXCLUDED.geom_original`,
        [
          route.id,
          route.codigo,
          route.nombre,
          route.servicioId,
          JSON.stringify(route.geometry),
          route.color,
          route.metadata,
          JSON.stringify(route.originalGeometry),
        ],
      );
    // This table is derived staging only. It contains no manually entered business records.
    await client.query('TRUNCATE cad_features');
    const lines = createInterface({
      input: createReadStream(new URL('municipal/cad-entities.jsonl.gz', directory)).pipe(
        createGunzip(),
      ),
      crlfDelay: Infinity,
    });
    let batch: unknown[] = [];
    let total = 0;
    async function flush() {
      if (!batch.length) return;
      await client.query(
        `WITH records AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          key text,category text,layer text,"entityType" text,text text,color integer,hidden boolean,
          "sourceSrid" integer,"inStudyArea" boolean,"references" jsonb,attributes jsonb,geometry jsonb)),
        geometries AS (SELECT *, CASE WHEN geometry IS NOT NULL THEN
          ST_SetSRID(ST_GeomFromGeoJSON(geometry),COALESCE("sourceSrid",0)) END AS original FROM records),
        checked AS (SELECT *,ST_IsValid(original) AS valid FROM geometries)
        INSERT INTO cad_features(key,category,layer,entity_type,text_value,color,hidden,source_srid,in_study_area,
          source_refs,attributes,geom_original,geom,is_valid,validity_reason)
        SELECT key,category,layer,"entityType",text,color,hidden,"sourceSrid","inStudyArea","references",attributes,
          original,CASE WHEN valid AND "sourceSrid"=32717 AND "inStudyArea" THEN ST_Transform(original,4326) END,
          valid,CASE WHEN original IS NOT NULL THEN ST_IsValidReason(original) END FROM checked`,
        [JSON.stringify(batch)],
      );
      total += batch.length;
      batch = [];
    }
    for await (const line of lines) {
      if (!line) continue;
      batch.push(JSON.parse(line));
      if (batch.length >= 500) await flush();
    }
    await flush();
    if (total !== data.statistics.uniqueEntities)
      throw new Error(
        'El conteo de entidades no coincide con el manifiesto; se revierte la importación.',
      );
    await client.query(
      `INSERT INTO municipal_imports(dataset,checksum,manifest) VALUES('municipal-cad-v1',$1,$2)
       ON CONFLICT(dataset) DO UPDATE SET checksum=EXCLUDED.checksum,manifest=EXCLUDED.manifest,imported_at=now()`,
      [checksum, data],
    );
    await client.query('COMMIT');
    console.log(
      `Municipal: ${data.routes.length} trazados y ${total} entidades CAD conservadas en PostGIS.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
