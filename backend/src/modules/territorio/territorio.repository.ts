import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../shared/app-error.js';
import type { Filters, PredioInput, PredioUpdate } from './territorio.schema.js';

const detailSql = `SELECT p.id, p.codigo, p.direccion, p.sector_id AS "sectorId", s.nombre AS sector,
 p.observaciones, p.is_demo AS "isDemo", p.version, p.updated_at AS "updatedAt",
 round(ST_Area(p.geom::geography)::numeric,1)::float AS "areaM2",
 ST_AsGeoJSON(ST_GeometryN(p.geom,1))::json AS geometry,
 COALESCE((SELECT json_agg(json_build_object('nombre',pe.nombre,'vinculo',pp.vinculo) ORDER BY pe.nombre)
 FROM persona_predio pp JOIN personas pe ON pe.id=pp.persona_id WHERE pp.predio_id=p.id),'[]') AS personas,
 COALESCE((SELECT json_agg(json_build_object('servicioId',se.id,'nombre',se.nombre,'color',se.color,
 'rutaId',r.id,'ruta',r.nombre,'codigoRuta',r.codigo,'horario',r.horario,'frecuencia',r.frecuencia) ORDER BY se.nombre)
 FROM predio_servicio ps JOIN servicios se ON se.id=ps.servicio_id LEFT JOIN rutas r ON r.id=ps.ruta_id
 WHERE ps.predio_id=p.id),'[]') AS servicios
 FROM predios p JOIN sectores s ON s.id=p.sector_id`;

function filterSql(filters: Filters) {
  const values: string[] = [];
  const parts: string[] = [];
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
    parts.push(
      `(p.codigo ILIKE $${values.length} OR p.direccion ILIKE $${values.length} OR EXISTS (SELECT 1 FROM persona_predio pp JOIN personas pe ON pe.id=pp.persona_id WHERE pp.predio_id=p.id AND pe.nombre ILIKE $${values.length}))`,
    );
  }
  if (filters.sector) {
    values.push(filters.sector);
    parts.push(`p.sector_id=$${values.length}`);
  }
  const assignments: string[] = [];
  if (filters.servicio) {
    values.push(filters.servicio);
    assignments.push(`ps.servicio_id=$${values.length}`);
  }
  if (filters.ruta) {
    values.push(filters.ruta);
    assignments.push(`ps.ruta_id=$${values.length}`);
  }
  if (assignments.length)
    parts.push(
      `EXISTS (SELECT 1 FROM predio_servicio ps WHERE ps.predio_id=p.id AND ${assignments.join(' AND ')})`,
    );
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values };
}

export function createTerritorioRepository(pool: Pool) {
  async function find(id: string, client: Pool | PoolClient = pool) {
    const result = await client.query(`${detailSql} WHERE p.id=$1`, [id]);
    if (!result.rows[0]) throw new AppError(404, 'PREDIO_NOT_FOUND', 'No se encontró el predio.');
    return result.rows[0];
  }
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === '23505')
          throw new AppError(409, 'DUPLICATE_CODE', 'Ya existe un predio con ese código.');
        if (error.code === '23503')
          throw new AppError(
            400,
            'INVALID_RELATION',
            'Revisa el sector, el servicio y la ruta seleccionados.',
          );
        if (error.code === '23514' || error.code === '22023')
          throw new AppError(
            400,
            'INVALID_GEOMETRY',
            'La geometría no es válida. Dibuja un polígono sin cruces.',
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
  async function validateGeometry(client: PoolClient, input: PredioInput) {
    const result = await client.query(
      `WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS geom)
      SELECT ST_IsValid(geom) AND NOT ST_IsEmpty(geom) AND ST_Area(geom::geography)>1 AS valid FROM g`,
      [JSON.stringify(input.geometry)],
    );
    if (!result.rows[0]?.valid)
      throw new AppError(
        400,
        'INVALID_GEOMETRY',
        'Dibuja un polígono válido de más de 1 m², sin cruces.',
      );
  }
  async function replaceLinks(client: PoolClient, id: string, input: PredioInput) {
    const old = await client.query(
      'DELETE FROM persona_predio WHERE predio_id=$1 RETURNING persona_id',
      [id],
    );
    for (const person of input.personas) {
      const inserted = await client.query(
        'INSERT INTO personas(nombre,is_demo) VALUES($1,true) RETURNING id',
        [person.nombre],
      );
      await client.query(
        'INSERT INTO persona_predio(predio_id,persona_id,vinculo) VALUES($1,$2,$3)',
        [id, inserted.rows[0].id, person.vinculo],
      );
    }
    if (old.rowCount)
      await client.query(
        'DELETE FROM personas p WHERE p.id=ANY($1::uuid[]) AND p.is_demo AND NOT EXISTS(SELECT 1 FROM persona_predio pp WHERE pp.persona_id=p.id)',
        [old.rows.map((row) => row.persona_id)],
      );
    await client.query('DELETE FROM predio_servicio WHERE predio_id=$1', [id]);
    for (const item of input.servicios)
      await client.query(
        'INSERT INTO predio_servicio(predio_id,servicio_id,ruta_id) VALUES($1,$2,$3)',
        [id, item.servicioId, item.rutaId],
      );
  }
  return {
    find,
    async list(filters: Filters) {
      const where = filterSql(filters);
      const result = await pool.query(
        `${detailSql} ${where.sql} ORDER BY p.codigo LIMIT 1000`,
        where.values,
      );
      const count = await pool.query(
        `SELECT count(*)::int AS total FROM predios p ${where.sql}`,
        where.values,
      );
      return { items: result.rows, total: count.rows[0].total, limit: 1000 };
    },
    async catalogs() {
      const [servicios, rutas, sectores] = await Promise.all([
        pool.query('SELECT id,nombre,color FROM servicios ORDER BY nombre'),
        pool.query(
          'SELECT id,codigo,nombre,servicio_id AS "servicioId",horario,frecuencia,is_demo AS "isDemo",metadata FROM rutas ORDER BY codigo',
        ),
        pool.query('SELECT id,nombre FROM sectores ORDER BY nombre'),
      ]);
      return { servicios: servicios.rows, rutas: rutas.rows, sectores: sectores.rows };
    },
    async layers(filters: Filters) {
      const result = await pool.query(
        `SELECT json_build_object(
        'sectores', (SELECT COALESCE(json_agg(json_build_object('type','Feature','id',s.id,'geometry',ST_AsGeoJSON(s.geom)::json,'properties',json_build_object('id',s.id,'nombre',s.nombre,'isDemo',s.is_demo))),'[]') FROM sectores s WHERE ($3::uuid IS NULL OR s.id=$3)),
        'rutas', (SELECT COALESCE(json_agg(json_build_object('type','Feature','id',r.id,'geometry',ST_AsGeoJSON(r.geom)::json,'properties',json_build_object('id',r.id,'nombre',r.nombre,'codigo',r.codigo,'horario',r.horario,'frecuencia',r.frecuencia,'servicio',s.nombre,'color',COALESCE(r.color,s.color),'isDemo',r.is_demo,'source',r.metadata->>'source','status',r.metadata->>'status','note',r.metadata->>'note','metadata',r.metadata,'lengthKm',round((ST_Length(r.geom::geography)/1000)::numeric,2),'servicioId',r.servicio_id))),'[]') FROM rutas r JOIN servicios s ON s.id=r.servicio_id WHERE ($1::uuid IS NULL OR r.servicio_id=$1) AND ($2::uuid IS NULL OR r.id=$2) AND ($3::uuid IS NULL OR ST_Intersects(r.geom,(SELECT geom FROM sectores WHERE id=$3)))),
        'puntos', (SELECT COALESCE(json_agg(json_build_object('type','Feature','id',p.id,'geometry',ST_AsGeoJSON(p.geom)::json,'properties',json_build_object('id',p.id,'nombre',p.nombre,'rutaId',r.id,'ruta',r.nombre,'horario',r.horario,'color',s.color,'isDemo',p.is_demo))),'[]') FROM puntos_recoleccion p JOIN rutas r ON r.id=p.ruta_id JOIN servicios s ON s.id=r.servicio_id WHERE ($1::uuid IS NULL OR r.servicio_id=$1) AND ($2::uuid IS NULL OR r.id=$2) AND ($3::uuid IS NULL OR ST_Intersects(p.geom,(SELECT geom FROM sectores WHERE id=$3))))
      ) AS layers`,
        [filters.servicio ?? null, filters.ruta ?? null, filters.sector ?? null],
      );
      const layers = result.rows[0].layers;
      return Object.fromEntries(
        Object.entries(layers).map(([key, features]) => [
          key,
          { type: 'FeatureCollection', features },
        ]),
      );
    },
    async create(input: PredioInput, demoKey?: string) {
      return transaction(async (client) => {
        await validateGeometry(client, input);
        const result = await client.query(
          `INSERT INTO predios(codigo,direccion,sector_id,observaciones,geom,dataset,demo_key) VALUES($1,$2,$3,$4,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5),4326)),$6,$7) RETURNING id`,
          [
            input.codigo,
            input.direccion,
            input.sectorId,
            input.observaciones,
            JSON.stringify(input.geometry),
            demoKey ? 'demo-seed-v1' : 'demo-manual',
            demoKey ?? null,
          ],
        );
        const id = result.rows[0].id as string;
        await replaceLinks(client, id, input);
        return find(id, client);
      });
    },
    async update(id: string, input: PredioUpdate) {
      return transaction(async (client) => {
        await validateGeometry(client, input);
        const current = await client.query('SELECT version FROM predios WHERE id=$1 FOR UPDATE', [
          id,
        ]);
        if (!current.rows[0])
          throw new AppError(404, 'PREDIO_NOT_FOUND', 'No se encontró el predio.');
        if (current.rows[0].version !== input.version)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'Este predio cambió en otra sesión. Cierra la edición y vuelve a abrirlo antes de guardar.',
          );
        await client.query(
          `UPDATE predios SET codigo=$2,direccion=$3,sector_id=$4,observaciones=$5,geom=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6),4326)),version=version+1,updated_at=now() WHERE id=$1`,
          [
            id,
            input.codigo,
            input.direccion,
            input.sectorId,
            input.observaciones,
            JSON.stringify(input.geometry),
          ],
        );
        await replaceLinks(client, id, input);
        return find(id, client);
      });
    },
    async remove(id: string, version: number) {
      return transaction(async (client) => {
        const current = await client.query('SELECT version FROM predios WHERE id=$1 FOR UPDATE', [
          id,
        ]);
        if (!current.rows[0])
          throw new AppError(404, 'PREDIO_NOT_FOUND', 'No se encontró el predio.');
        if (current.rows[0].version !== version)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'El predio cambió. Actualiza la ficha antes de eliminarlo.',
          );
        const people = await client.query(
          'SELECT persona_id FROM persona_predio WHERE predio_id=$1',
          [id],
        );
        await client.query('DELETE FROM predios WHERE id=$1', [id]);
        await client.query(
          'DELETE FROM personas p WHERE p.id=ANY($1::uuid[]) AND p.is_demo AND NOT EXISTS(SELECT 1 FROM persona_predio pp WHERE pp.persona_id=p.id)',
          [people.rows.map((p) => p.persona_id)],
        );
      });
    },
  };
}
export type TerritorioRepository = ReturnType<typeof createTerritorioRepository>;
