import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pool } from './pool.js';

// Unificación territorial: reemplaza por completo las tablas territorio_* con un paquete
// nuevo (transacción única). Mismo paquete: no hace nada. Nada fuera de estas tablas cambia.
const DATASET = 'territorio-unificado-v1';
const BATCH = 500;

interface Package {
  dataset: string;
  reglas: { id: string; version: number; descripcion: string; parametros?: unknown }[];
  entidades: Record<string, unknown>[];
  representaciones: Record<string, unknown>[];
  atributos: Record<string, unknown>[];
  relaciones: Record<string, unknown>[];
  conflictos: Record<string, unknown>[];
  excepciones: Record<string, unknown>[];
  auditoria: Record<string, unknown>;
}

const bytes = await readFile(
  new URL('../../../database/municipal/territorio-unificado.json.gz', import.meta.url),
);
const text = gunzipSync(bytes).toString('utf8');
const data = JSON.parse(text) as Package;
if (data.dataset !== DATASET) throw new Error('Paquete territorial no compatible.');
const hash = createHash('sha256').update(text).digest('hex');

const client = await pool.connect();
try {
  const previous = await client.query('SELECT checksum FROM municipal_imports WHERE dataset=$1', [
    DATASET,
  ]);
  if (previous.rows[0]?.checksum === hash) {
    console.log('Territorio unificado idéntico: se conservan los datos existentes.');
  } else {
    await client.query('BEGIN');
    // Los paquetes grandes superan el límite de consulta del pool; solo dentro de esta transacción.
    await client.query('SET LOCAL statement_timeout = 0');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-migrations'))");

    for (let i = 0; i < data.entidades.length; i += BATCH) {
      await client.query(
        `INSERT INTO territorio_entidad(id,kind,nombre,nombre_normalizado,criterio,estado,provisional,referencia,
          num_representaciones,num_atributos,num_conflictos,marco,geom,dataset_hash)
        SELECT x.id,x.kind,x.nombre,x.nombre_normalizado,x.criterio,x.estado,x.provisional,x.referencia,
          x.num_representaciones,x.num_atributos,x.num_conflictos,
          ST_SetSRID(ST_GeomFromGeoJSON(x.marco::text),32717),ST_SetSRID(ST_GeomFromGeoJSON(x.geom::text),4326),$2
        FROM jsonb_to_recordset($1::jsonb) AS x(id text,kind text,nombre text,nombre_normalizado text,criterio text,
          estado jsonb,provisional boolean,referencia text,num_representaciones integer,num_atributos integer,
          num_conflictos integer,marco jsonb,geom jsonb)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,nombre=excluded.nombre,
          nombre_normalizado=excluded.nombre_normalizado,criterio=excluded.criterio,estado=excluded.estado,
          provisional=excluded.provisional,referencia=excluded.referencia,
          num_representaciones=excluded.num_representaciones,num_atributos=excluded.num_atributos,
          num_conflictos=excluded.num_conflictos,marco=excluded.marco,geom=excluded.geom,
          dataset_hash=excluded.dataset_hash`,
        [JSON.stringify(data.entidades.slice(i, i + BATCH).map(entityRow)), hash],
      );
    }

    for (let i = 0; i < data.representaciones.length; i += BATCH) {
      await client.query(
        `INSERT INTO territorio_representacion(key,entidad_id,source,ref,layer,entity_type,kind,geom_type,crs_status,
          offset_e,offset_n,desviacion_m,origen,texto,atributos,marco,geom_original,geom,dataset_hash)
        SELECT x.key,x.entidad_id,x.source,x.ref,x.layer,x.entity_type,x.kind,x.geom_type,x.crs_status,
          x.offset_e,x.offset_n,x.desviacion_m,x.origen,x.texto,x.atributos,
          ST_SetSRID(ST_GeomFromGeoJSON(x.marco::text),32717),
          CASE WHEN x.raw IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(x.raw::text),0) END,
          ST_SetSRID(ST_GeomFromGeoJSON(x.geom::text),4326),$2
        FROM jsonb_to_recordset($1::jsonb) AS x(key text,entidad_id text,source text,ref text,layer text,
          entity_type text,kind text,geom_type text,crs_status text,offset_e double precision,offset_n double precision,
          desviacion_m double precision,origen text,texto text,atributos jsonb,marco jsonb,raw jsonb,geom jsonb)
        ON CONFLICT(key) DO UPDATE SET entidad_id=excluded.entidad_id,source=excluded.source,ref=excluded.ref,
          layer=excluded.layer,entity_type=excluded.entity_type,kind=excluded.kind,geom_type=excluded.geom_type,
          crs_status=excluded.crs_status,offset_e=excluded.offset_e,offset_n=excluded.offset_n,
          desviacion_m=excluded.desviacion_m,origen=excluded.origen,texto=excluded.texto,atributos=excluded.atributos,
          marco=excluded.marco,geom_original=excluded.geom_original,geom=excluded.geom,dataset_hash=excluded.dataset_hash`,
        [JSON.stringify(data.representaciones.slice(i, i + BATCH).map(representationRow)), hash],
      );
    }

    await insertRows(
      client,
      'territorio_atributo',
      `(id,entidad_id,clave,valor,tipo,fuente,justificacion,dataset_hash)`,
      `x.id,x.entidad_id,x.clave,x.valor,x.tipo,x.fuente,x.justificacion,$2`,
      `id text,entidad_id text,clave text,valor jsonb,tipo text,fuente jsonb,justificacion text`,
      data.atributos.map((a) => ({
        id: a.id,
        entidad_id: a.entidad,
        clave: a.clave,
        valor: a.valor,
        tipo: a.tipo,
        fuente: a.fuente,
        justificacion: a.justificacion,
      })),
      hash,
      'id',
      `id=excluded.id,entidad_id=excluded.entidad_id,clave=excluded.clave,valor=excluded.valor,tipo=excluded.tipo,fuente=excluded.fuente,justificacion=excluded.justificacion,dataset_hash=excluded.dataset_hash`,
    );
    await insertRows(
      client,
      'territorio_relacion',
      `(id,tipo,desde,hacia,evidencia,regla,dataset_hash)`,
      `x.id,x.tipo,x.desde,x.hacia,x.evidencia,x.regla,$2`,
      `id text,tipo text,desde text,hacia text,evidencia jsonb,regla text`,
      data.relaciones,
      hash,
      'id',
      `tipo=excluded.tipo,desde=excluded.desde,hacia=excluded.hacia,evidencia=excluded.evidencia,regla=excluded.regla,dataset_hash=excluded.dataset_hash`,
    );
    await insertRows(
      client,
      'territorio_conflicto',
      `(id,entidad_id,propiedad,estado,valores,evidencia,dataset_hash)`,
      `x.id,x.entidad_id,x.propiedad,x.estado,x.valores,x.evidencia,$2`,
      `id text,entidad_id text,propiedad text,estado text,valores jsonb,evidencia jsonb`,
      data.conflictos.map((c) => ({ ...c, entidad_id: c.entidad ?? null })),
      hash,
      'id',
      `entidad_id=excluded.entidad_id,propiedad=excluded.propiedad,estado=excluded.estado,valores=excluded.valores,evidencia=excluded.evidencia,dataset_hash=excluded.dataset_hash`,
    );
    await insertRows(
      client,
      'territorio_excepcion',
      `(id,entidad_id,representacion,causa,datos,nota,dataset_hash)`,
      `x.id,x.entidad_id,x.representacion,x.causa,x.datos,x.nota,$2`,
      `id text,entidad_id text,representacion text,causa text,datos jsonb,nota text`,
      data.excepciones.map((x) => ({
        id: x.id,
        entidad_id: x.entidad ?? null,
        representacion: x.representacion ?? null,
        causa: x.causa,
        datos: x.datos,
        nota: x.nota,
      })),
      hash,
      'id',
      `entidad_id=excluded.entidad_id,representacion=excluded.representacion,causa=excluded.causa,datos=excluded.datos,nota=excluded.nota,dataset_hash=excluded.dataset_hash`,
    );
    await insertRows(
      client,
      'territorio_regla',
      `(id,version,descripcion,parametros,dataset_hash)`,
      `x.id,x.version,x.descripcion,x.parametros,$2`,
      `id text,version integer,descripcion text,parametros jsonb`,
      data.reglas.map((r) => ({ ...r, parametros: r.parametros ?? {} })),
      hash,
      'id,version',
      `descripcion=excluded.descripcion,parametros=excluded.parametros,dataset_hash=excluded.dataset_hash`,
    );

    // Filas de paquetes anteriores que ya no existen en este: se retiran dentro de la misma transacción.
    const removed: Record<string, number> = {};
    for (const table of [
      'territorio_representacion',
      'territorio_atributo',
      'territorio_relacion',
      'territorio_conflicto',
      'territorio_excepcion',
      'territorio_regla',
      'territorio_entidad',
    ]) {
      const result = await client.query(`DELETE FROM ${table} WHERE dataset_hash<>$1`, [hash]);
      removed[table] = result.rowCount ?? 0;
    }
    await client.query(
      `INSERT INTO municipal_imports(dataset,checksum,manifest) VALUES($1,$2,$3)
       ON CONFLICT(dataset) DO UPDATE SET checksum=$2,manifest=$3,imported_at=now()`,
      [DATASET, hash, data.auditoria],
    );
    await client.query('COMMIT');
    console.log(
      `Territorio unificado: ${data.entidades.length} entidades, ${data.representaciones.length} representaciones, ` +
        `${data.atributos.length} atributos, ${data.relaciones.length} relaciones, ${data.conflictos.length} conflictos, ` +
        `${data.excepciones.length} excepciones. Retirados de paquetes anteriores: ${JSON.stringify(removed)}.`,
    );
  }
  const counts = await client.query(
    `SELECT kind,count(*)::int AS total FROM territorio_entidad GROUP BY kind ORDER BY kind`,
  );
  for (const row of counts.rows) console.log(`  ${row.kind}: ${row.total}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

function entityRow(e: Record<string, unknown>) {
  return {
    id: e.id,
    kind: e.kind,
    nombre: e.nombre,
    nombre_normalizado: e.nombreNormalizado ?? null,
    criterio: e.criterio,
    estado: e.estado,
    provisional: e.provisional,
    referencia: e.referencia,
    num_representaciones: (e.representaciones as unknown[]).length,
    num_atributos: e.atributos,
    num_conflictos: (e.conflictos as unknown[]).length,
    marco: e.marco,
    geom: e.geometry4326,
  };
}

function representationRow(r: Record<string, unknown>) {
  return {
    key: r.key,
    entidad_id: r.entidad,
    source: r.source,
    ref: r.ref,
    layer: r.layer,
    entity_type: r.entityType,
    kind: r.kind,
    geom_type: r.geomType,
    crs_status: r.crsStatus,
    offset_e: (r.offset as number[])[0],
    offset_n: (r.offset as number[])[1],
    desviacion_m: r.desviacionM,
    origen: r.origen,
    texto: r.texto ?? null,
    atributos: r.atributos ?? {},
    marco: r.marco,
    raw: r.coordenadasBrutas ?? null,
    geom: r.geometry4326,
  };
}

async function insertRows(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  table: string,
  columns: string,
  select: string,
  recordset: string,
  rows: Record<string, unknown>[],
  hash: string,
  conflict: string,
  update: string,
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await client.query(
      `INSERT INTO ${table}${columns}
       SELECT ${select} FROM jsonb_to_recordset($1::jsonb) AS x(${recordset})
       ON CONFLICT(${conflict}) DO UPDATE SET ${update}`,
      [JSON.stringify(rows.slice(i, i + BATCH)), hash],
    );
  }
}
