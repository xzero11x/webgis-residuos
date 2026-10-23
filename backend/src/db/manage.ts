import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { createTerritorioRepository } from '../modules/territorio/territorio.repository.js';
import { predioSchema } from '../modules/territorio/territorio.schema.js';
import { importMunicipal } from './import-municipal.js';

const directory = new URL('../../../database/', import.meta.url);
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('bagua-migrations'))");
  const command = process.argv[2] || 'migrate';
  if (command === 'migrate') {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = (await readdir(new URL('migrations/', directory)))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const name of files) {
      const sql = await readFile(new URL(`migrations/${name}`, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [
        name,
      ]);
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`La migración aplicada ${name} fue modificada.`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
          name,
          checksum,
        ]);
        await client.query('COMMIT');
        console.log(`Aplicada: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } else if (command === 'import-municipal') {
    await importMunicipal(client, directory);
  } else if (command === 'seed') {
    const data = JSON.parse(await readFile(new URL('demo/seed.json', directory), 'utf8'));
    await client.query('BEGIN');
    try {
      for (const item of data.servicios)
        await client.query(
          'INSERT INTO servicios(id,nombre,color) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
          [item.id, item.nombre, item.color],
        );
      for (const item of data.sectores)
        await client.query(
          'INSERT INTO sectores(id,nombre,geom) VALUES($1,$2,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3),4326))) ON CONFLICT(id) DO NOTHING',
          [item.id, item.nombre, JSON.stringify(item.geometry)],
        );
      for (const item of data.rutas)
        await client.query(
          'INSERT INTO rutas(id,codigo,nombre,servicio_id,horario,frecuencia,geom) VALUES($1,$2,$3,$4,$5,$6,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7),4326))) ON CONFLICT(id) DO NOTHING',
          [
            item.id,
            item.codigo,
            item.nombre,
            item.servicioId,
            item.horario,
            item.frecuencia,
            JSON.stringify(item.geometry),
          ],
        );
      for (const item of data.puntos)
        await client.query(
          'INSERT INTO puntos_recoleccion(id,nombre,ruta_id,geom) VALUES($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326)) ON CONFLICT(id) DO NOTHING',
          [item.id, item.nombre, item.rutaId, JSON.stringify(item.geometry)],
        );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    const repository = createTerritorioRepository(pool);
    for (const item of data.predios) {
      const exists = await client.query('SELECT id FROM predios WHERE demo_key=$1', [item.codigo]);
      if (exists.rowCount) continue;
      await repository.create(predioSchema.parse(item), item.codigo);
    }
    console.log('DEMO cargado. Los registros existentes y sus ediciones se conservan.');
  } else if (command === 'clear-demo') {
    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM predios WHERE is_demo;
        DELETE FROM personas p WHERE is_demo AND NOT EXISTS(SELECT 1 FROM persona_predio pp WHERE pp.persona_id=p.id);
        DELETE FROM puntos_recoleccion WHERE is_demo;
        DELETE FROM rutas r WHERE is_demo AND NOT EXISTS(SELECT 1 FROM predio_servicio ps WHERE ps.ruta_id=r.id) AND NOT EXISTS(SELECT 1 FROM puntos_recoleccion p WHERE p.ruta_id=r.id);
        DELETE FROM sectores s WHERE is_demo AND NOT EXISTS(SELECT 1 FROM predios p WHERE p.sector_id=s.id);
        DELETE FROM servicios s WHERE is_demo AND NOT EXISTS(SELECT 1 FROM predio_servicio ps WHERE ps.servicio_id=s.id) AND NOT EXISTS(SELECT 1 FROM rutas r WHERE r.servicio_id=s.id);`);
      await client.query('COMMIT');
      console.log(
        'Registros DEMO eliminados. Se preservan datos no DEMO y catálogos referenciados por ellos.',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } else throw new Error(`Comando desconocido: ${command}`);
  console.log(`Base procesada con archivos en ${fileURLToPath(directory)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Error de base de datos');
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('bagua-migrations'))");
  client.release();
  await pool.end();
}
