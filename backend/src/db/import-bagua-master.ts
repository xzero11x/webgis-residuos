import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { env } from '../config/env.js';
import { pool } from './pool.js';

// BAGUA MASTER: importa el subconjunto de Overture al esquema bagua_master (transacción única).
// No toca ninguna tabla fuera de bagua_master. Mismo paquete: no hace nada.
const BATCH = 500;
const dataDir = env.BAGUA_MASTER_DATA_DIR;

interface Element {
  id: string;
  geometria: unknown;
  geom_valida: boolean;
  [key: string]: unknown;
}
interface Package {
  dataset: string;
  version_overture: string;
  esquema_overture: string;
  atribucion: string;
  manifiesto_sha256: string;
  inventario: unknown[];
  tablas: Record<string, Element[]>;
}

// Columnas por tabla (además de id, atributos, fuentes, archivo_overture, geometrías y validez).
const TABLES: Record<string, { columns: [string, string][] }> = {
  red_vial: {
    columns: [
      ['clase', 'text'],
      ['subclase', 'text'],
      ['nombre', 'text'],
      ['nombres', 'jsonb'],
    ],
  },
  conector: { columns: [] },
  edificio: {
    columns: [
      ['clase', 'text'],
      ['subtipo', 'text'],
      ['nombre', 'text'],
      ['altura_m', 'double precision'],
      ['num_pisos', 'integer'],
    ],
  },
  parte_edificio: { columns: [['clase', 'text']] },
  uso_suelo: {
    columns: [
      ['clase', 'text'],
      ['subtipo', 'text'],
      ['nombre', 'text'],
    ],
  },
  agua: {
    columns: [
      ['clase', 'text'],
      ['subtipo', 'text'],
      ['nombre', 'text'],
    ],
  },
  terreno: {
    columns: [
      ['clase', 'text'],
      ['subtipo', 'text'],
      ['nombre', 'text'],
    ],
  },
  lugar: {
    columns: [
      ['categoria', 'text'],
      ['nombre', 'text'],
      ['nombres', 'jsonb'],
    ],
  },
};

const packagePath = path.join(dataDir, 'paquete', 'elementos.json.gz');
const bytes = await readFile(packagePath);
const text = gunzipSync(bytes).toString('utf8');
const data = JSON.parse(text) as Package;
if (data.dataset !== 'bagua-master-overture-v1')
  throw new Error('Paquete de BAGUA MASTER no compatible.');
const packageHash = createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.join(dataDir, 'descarga', data.version_overture, 'manifest.json');
const manifestBytes = await readFile(manifestPath);
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');
if (manifestHash !== data.manifiesto_sha256)
  throw new Error('El manifiesto de descarga no coincide con el que generó el paquete.');
const manifest = JSON.parse(manifestBytes.toString('utf8'));

const client = await pool.connect();
try {
  const previous = await client.query(
    "SELECT paquete_sha256 FROM bagua_master.version WHERE id='bagua-master'",
  );
  if (previous.rows[0]?.paquete_sha256 === packageHash) {
    console.log('BAGUA MASTER idéntico: se conservan los datos existentes.');
  } else {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 0');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-master-import'))");
    const counts: Record<string, number> = {};
    for (const [table, spec] of Object.entries(TABLES)) {
      const rows = data.tablas[table] ?? [];
      const extra = spec.columns.map(([name]) => name);
      const recordset = [
        'id text',
        ...spec.columns.map(([name, type]) => `${name} ${type}`),
        'atributos jsonb',
        'fuentes jsonb',
        'archivo_overture text',
        'geometria jsonb',
        'geom_valida boolean',
      ].join(',');
      const columns = ['id', ...extra, 'atributos', 'fuentes', 'archivo_overture'];
      const updates = [
        ...extra,
        'atributos',
        'fuentes',
        'archivo_overture',
        'geom',
        'geom_utm',
        'geom_valida',
        'dataset_hash',
      ]
        .map((c) => `${c}=excluded.${c}`)
        .join(',');
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((e) => {
          const row: Record<string, unknown> = {
            id: e.id,
            atributos: e.atributos ?? {},
            fuentes: e.fuentes ?? [],
            archivo_overture: e.archivo_overture,
            geometria: e.geometria,
            geom_valida: e.geom_valida,
          };
          for (const name of extra) row[name] = e[name] ?? null;
          return row;
        });
        await client.query(
          `INSERT INTO bagua_master.${table}(${columns.join(',')},geom,geom_utm,geom_valida,dataset_hash)
           SELECT ${columns.map((c) => `x.${c}`).join(',')},
             ST_SetSRID(ST_GeomFromGeoJSON(x.geometria::text),4326),
             ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(x.geometria::text),4326),32718),
             x.geom_valida,$2
           FROM jsonb_to_recordset($1::jsonb) AS x(${recordset})
           ON CONFLICT(id) DO UPDATE SET ${updates}`,
          [JSON.stringify(batch), packageHash],
        );
      }
      // Elementos de un paquete anterior que ya no están en este.
      await client.query(`DELETE FROM bagua_master.${table} WHERE dataset_hash<>$1`, [packageHash]);
      counts[table] = rows.length;
    }
    for (const c of manifest.conjuntos) {
      await client.query(
        `INSERT INTO bagua_master.conjunto(nombre,tema,tipo,archivo,sha256,filas,ids_unicos,geometria_nula,
           geometria_vacia,geometria_invalida,tipos_geometria,fuentes_primarias,dataset_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT(nombre) DO UPDATE SET tema=excluded.tema,tipo=excluded.tipo,archivo=excluded.archivo,
           sha256=excluded.sha256,filas=excluded.filas,ids_unicos=excluded.ids_unicos,
           geometria_nula=excluded.geometria_nula,geometria_vacia=excluded.geometria_vacia,
           geometria_invalida=excluded.geometria_invalida,tipos_geometria=excluded.tipos_geometria,
           fuentes_primarias=excluded.fuentes_primarias,dataset_hash=excluded.dataset_hash`,
        [
          c.nombre,
          c.tema,
          c.tipo,
          c.archivo,
          c.sha256,
          c.filas,
          c.ids_unicos,
          c.geometria_nula,
          c.geometria_vacia,
          c.geometria_invalida,
          JSON.stringify(c.tipos_geometria),
          JSON.stringify(c.fuentes_primarias),
          packageHash,
        ],
      );
    }
    await client.query('DELETE FROM bagua_master.conjunto WHERE dataset_hash<>$1', [packageHash]);
    await client.query(
      `INSERT INTO bagua_master.version(id,version_overture,esquema_overture,atribucion,extraccion_utc,descarga_bbox,
         ventana_urbana,manifiesto_sha256,paquete_sha256,resumen)
       VALUES('bagua-master',$1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET version_overture=excluded.version_overture,esquema_overture=excluded.esquema_overture,
         atribucion=excluded.atribucion,extraccion_utc=excluded.extraccion_utc,descarga_bbox=excluded.descarga_bbox,
         ventana_urbana=excluded.ventana_urbana,manifiesto_sha256=excluded.manifiesto_sha256,
         paquete_sha256=excluded.paquete_sha256,resumen=excluded.resumen,importado_en=now()`,
      [
        data.version_overture,
        data.esquema_overture,
        data.atribucion,
        manifest.extraccion_utc,
        manifest.descarga_bbox,
        manifest.ventana_urbana,
        manifestHash,
        packageHash,
        JSON.stringify({ inventario: data.inventario, elementos: counts }),
      ],
    );
    await client.query('COMMIT');
    console.log(
      `BAGUA MASTER importado (Overture ${data.version_overture}): ${JSON.stringify(counts)}`,
    );
  }
  const totals = await client.query(
    `SELECT 'red_vial' t,count(*)::int n FROM bagua_master.red_vial UNION ALL SELECT 'conector',count(*)::int FROM bagua_master.conector
     UNION ALL SELECT 'edificio',count(*)::int FROM bagua_master.edificio UNION ALL SELECT 'parte_edificio',count(*)::int FROM bagua_master.parte_edificio
     UNION ALL SELECT 'uso_suelo',count(*)::int FROM bagua_master.uso_suelo UNION ALL SELECT 'agua',count(*)::int FROM bagua_master.agua
     UNION ALL SELECT 'terreno',count(*)::int FROM bagua_master.terreno UNION ALL SELECT 'lugar',count(*)::int FROM bagua_master.lugar`,
  );
  for (const row of totals.rows) console.log(`  ${row.t}: ${row.n}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
