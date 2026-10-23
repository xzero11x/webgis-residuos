import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { pool } from './pool.js';

// BAGUA MASTER (fase 2): importa las rutas municipales documentadas a bagua_master.ruta,
// ruta_flecha y ruta_marcador. Solo escribe en esas tablas; no toca public.rutas, red_vial ni nada
// fuera de bagua_master. Mismo archivo: no hace nada.
interface RouteFile {
  aviso: string;
  rutas: {
    codigo: string;
    nombre: string;
    color: string;
    estado: 'georreferenciada' | 'revision';
    fuente_archivo: string;
    fuente_sha256: string;
    nota: string;
    advertencias: string[];
    sectores: string[];
    crs: string;
    segmentos: number;
    longitud_trazos_m: number;
    significado_longitud: string;
    horario_estado: string;
    sentido_estado: string;
    flechas: Record<string, number>;
    procedencia: { trazos: string; flechas: string[]; marcadores: string[] };
    geometria: unknown;
  }[];
  flechas: {
    id: string;
    ruta: string;
    lon: number;
    lat: number;
    rumbo: number;
    fuente: string;
    capa: string;
    distancia_trazo_m: number;
    alineacion_grados: number;
    verificada: boolean;
    duplicada_de: string | null;
  }[];
  marcadores: {
    id: string;
    ruta: string;
    tipo: string;
    lon: number;
    lat: number;
    nombre: string;
    capa: string;
    fuente: string;
  }[];
}

// Fuente única: DWG municipales. Los PDF no son fuente activa de rutas (el archivo `excluidas` del
// JSON solo documenta qué se dejó fuera). La base también lo impide con restricciones CHECK.
const isDwg = (name: string) => /\.dwg$/i.test(name);

const file = path.join(env.BAGUA_MASTER_DATA_DIR, 'rutas', 'rutas.json');
const bytes = await readFile(file);
const data = JSON.parse(bytes.toString('utf8')) as RouteFile;
const notDwg = [
  ...data.rutas.map((r) => r.fuente_archivo),
  ...data.flechas.map((a) => a.fuente),
  ...data.marcadores.map((m) => m.fuente),
].filter((name) => !isDwg(name));
if (notDwg.length)
  throw new Error(`Se rechaza la importación: ${notDwg.length} elementos no proceden de un DWG.`);
const hash = createHash('sha256').update(bytes).digest('hex');

const client = await pool.connect();
try {
  const existing = await client.query(
    'SELECT count(*)::int AS n, count(*) FILTER (WHERE dataset_hash=$1)::int AS same FROM bagua_master.ruta',
    [hash],
  );
  if (existing.rows[0].n === data.rutas.length && existing.rows[0].same === data.rutas.length) {
    console.log('Rutas idénticas: se conservan los datos existentes.');
  } else {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bagua-master-import'))");
    for (const table of ['ruta_flecha', 'ruta_marcador', 'ruta']) {
      await client.query(`DELETE FROM bagua_master.${table}`);
    }
    const codes = new Set(data.rutas.map((r) => r.codigo));
    const orphans = [...data.flechas, ...data.marcadores].filter((x) => !codes.has(x.ruta));
    if (orphans.length) throw new Error(`${orphans.length} símbolos apuntan a rutas inexistentes.`);
    for (const [index, r] of data.rutas.entries()) {
      await client.query(
        `INSERT INTO bagua_master.ruta(codigo,orden,nombre,color,estado,fuente_archivo,fuente_sha256,nota,
           advertencias,sectores,crs,segmentos,longitud_trazos_m,significado_longitud,horario_estado,
           sentido_estado,flechas,geom,aviso,dataset_hash,procedencia)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
           ST_SetSRID(ST_GeomFromGeoJSON($18),4326),$19,$20,$21)`,
        [
          r.codigo,
          index,
          r.nombre,
          r.color,
          r.estado,
          r.fuente_archivo,
          r.fuente_sha256,
          r.nota,
          JSON.stringify(r.advertencias),
          JSON.stringify(r.sectores),
          r.crs,
          r.segmentos,
          r.longitud_trazos_m,
          r.significado_longitud,
          r.horario_estado,
          r.sentido_estado,
          JSON.stringify(r.flechas),
          JSON.stringify(r.geometria),
          data.aviso,
          hash,
          JSON.stringify(r.procedencia),
        ],
      );
    }
    await client.query(
      `INSERT INTO bagua_master.ruta_flecha(id,ruta_codigo,rumbo,verificada,duplicada_de,alineacion_grados,
         distancia_trazo_m,fuente,capa,geom,dataset_hash)
       SELECT x.id,x.ruta,x.rumbo,x.verificada,x.duplicada_de,x.alineacion_grados,x.distancia_trazo_m,
         x.fuente,x.capa,ST_SetSRID(ST_MakePoint(x.lon,x.lat),4326),$2
       FROM jsonb_to_recordset($1::jsonb) AS x(id text,ruta text,rumbo numeric,verificada boolean,
         duplicada_de text,alineacion_grados numeric,distancia_trazo_m numeric,fuente text,capa text,
         lon float8,lat float8)`,
      [JSON.stringify(data.flechas), hash],
    );
    await client.query(
      `INSERT INTO bagua_master.ruta_marcador(id,ruta_codigo,tipo,nombre,capa,fuente,geom,dataset_hash)
       SELECT x.id,x.ruta,x.tipo,x.nombre,x.capa,x.fuente,ST_SetSRID(ST_MakePoint(x.lon,x.lat),4326),$2
       FROM jsonb_to_recordset($1::jsonb) AS x(id text,ruta text,tipo text,nombre text,capa text,
         fuente text,lon float8,lat float8)`,
      [JSON.stringify(data.marcadores), hash],
    );
    await client.query('COMMIT');
    console.log(
      `Rutas importadas: ${data.rutas.length}, flechas ${data.flechas.length}, marcadores ${data.marcadores.length}.`,
    );
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
