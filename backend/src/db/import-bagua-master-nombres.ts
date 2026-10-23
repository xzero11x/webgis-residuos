import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { pool } from './pool.js';

// BAGUA MASTER: importa los nombres complementarios (DWG de Tomaque) a bagua_master.nombre_complementario.
// Solo escribe en esa tabla; no toca red_vial ni nada fuera de bagua_master. Mismo archivo: no hace nada.
interface Association {
  nombre: string;
  texto_documental: string;
  tipo: string;
  nivel: 'texto' | 'continuidad';
  rpu: 'respaldado' | 'sin_cobertura' | 'no_confirmado';
  textos: number;
  evidencia?: unknown[];
  vecinos?: string[];
  distancia_min_m?: number;
  diferencia_angulo_max?: number;
  concordancia_local?: number | null;
  giro_max?: number;
}
interface NamesFile {
  fuente: string;
  version_overture: string;
  aviso: string;
  procedencia: { entidades_sha256: string; traslacion_m: unknown };
  parametros: unknown;
  asociaciones: Record<string, Association>;
}

const file = path.join(env.BAGUA_MASTER_DATA_DIR, 'nombres', 'nombres_dwg.json');
const bytes = await readFile(file);
const data = JSON.parse(bytes.toString('utf8')) as NamesFile;
const hash = createHash('sha256').update(bytes).digest('hex');

const client = await pool.connect();
try {
  const existing = await client.query(
    'SELECT count(*)::int AS n, count(*) FILTER (WHERE dataset_hash=$1)::int AS same FROM bagua_master.nombre_complementario',
    [hash],
  );
  const entries = Object.entries(data.asociaciones);
  if (existing.rows[0].n === entries.length && existing.rows[0].same === entries.length) {
    console.log('Nombres complementarios idénticos: se conservan los datos existentes.');
  } else {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-master-import'))");
    const rows = entries.map(([id, a]) => ({
      segmento_id: id,
      nombre: a.nombre,
      nombre_documental: a.texto_documental,
      nivel: a.nivel,
      respaldo_rpu: a.rpu,
      evidencia: {
        textos: a.textos,
        detalle: a.evidencia ?? [],
        vecinos: a.vecinos ?? null,
        distanciaMinM: a.distancia_min_m ?? null,
        diferenciaAnguloMax: a.diferencia_angulo_max ?? null,
        concordanciaLocal: a.concordancia_local ?? null,
        giroMax: a.giro_max ?? null,
        parametros: data.parametros,
        traslacionM: data.procedencia.traslacion_m,
      },
    }));
    // Solo se importan asociaciones de tramos que existen en red_vial (el id es el de Overture).
    const known = await client.query(
      'SELECT id FROM bagua_master.red_vial WHERE id = ANY($1::text[])',
      [rows.map((r) => r.segmento_id)],
    );
    const present = new Set(known.rows.map((r) => r.id as string));
    const missing = rows.filter((r) => !present.has(r.segmento_id)).length;
    if (missing)
      throw new Error(`${missing} asociaciones apuntan a tramos que no están en red_vial.`);
    await client.query(
      `INSERT INTO bagua_master.nombre_complementario(segmento_id,nombre,nombre_documental,origen,nivel,
         respaldo_rpu,evidencia,fuente_archivo,fuente_sha256,version_overture,aviso,dataset_hash)
       SELECT x.segmento_id,x.nombre,x.nombre_documental,'dwg-tomaque',x.nivel,x.respaldo_rpu,x.evidencia,
         $2,$3,$4,$5,$6
       FROM jsonb_to_recordset($1::jsonb) AS x(segmento_id text,nombre text,nombre_documental text,nivel text,
         respaldo_rpu text,evidencia jsonb)
       ON CONFLICT(segmento_id) DO UPDATE SET nombre=excluded.nombre,nombre_documental=excluded.nombre_documental,
         nivel=excluded.nivel,respaldo_rpu=excluded.respaldo_rpu,evidencia=excluded.evidencia,
         fuente_archivo=excluded.fuente_archivo,fuente_sha256=excluded.fuente_sha256,
         version_overture=excluded.version_overture,aviso=excluded.aviso,dataset_hash=excluded.dataset_hash,
         importado_en=now()`,
      [
        JSON.stringify(rows),
        data.fuente,
        data.procedencia.entidades_sha256,
        data.version_overture,
        data.aviso,
        hash,
      ],
    );
    await client.query('DELETE FROM bagua_master.nombre_complementario WHERE dataset_hash<>$1', [
      hash,
    ]);
    await client.query('COMMIT');
    console.log(`Nombres complementarios importados: ${rows.length}.`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
