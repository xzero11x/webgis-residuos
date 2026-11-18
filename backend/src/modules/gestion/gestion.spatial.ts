import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';

export const spatialProposal = z
  .object({
    edificioId: z.string().min(1).max(150),
    criterio: z.enum(['seleccion_mapa', 'interseccion_vista']),
    evidencia: z.string().trim().min(5).max(1000),
    versionPredio: z.number().int().positive(),
  })
  .strict();
export const spatialDecision = z
  .object({
    estado: z.enum(['revision', 'confirmado', 'rechazado', 'desvinculado']),
    motivo: z.string().trim().min(5).max(1000),
    version: z.number().int().positive(),
    versionPredio: z.number().int().positive(),
    compartido: z.boolean().default(false),
  })
  .strict();
const geometry = `ST_AsGeoJSON(e.geom)::json AS geometria`;
async function parent(c: PoolClient, id: string, version?: number) {
  const row = (
    await c.query(
      'SELECT id,codigo,direccion,version,archivado,estado_ubicacion FROM gestion.predio WHERE id=$1 FOR SHARE',
      [id],
    )
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
  if (version !== undefined && (row.archivado || row.version !== version))
    throw new AppError(
      409,
      'SPATIAL_STALE',
      'Predio archivado o modificado. Recarga antes de decidir.',
    );
  return row;
}
export function createSpatialRouter(pool: Pool) {
  const router = Router();
  router.get('/espacial/edificios/:edificio/predios', async (req, res) => {
    const id = z.string().min(1).max(150).parse(req.params.edificio);
    res.json({
      items: (
        await pool.query(
          `SELECT p.id,p.codigo,p.direccion,p.archivado,v.estado FROM gestion.vinculo_espacial v JOIN gestion.predio p ON p.id=v.predio_id WHERE v.edificio_id=$1 AND v.estado='confirmado' ORDER BY p.codigo`,
          [id],
        )
      ).rows,
    });
  });
  router.get('/espacial/candidatos', async (req, res) => {
    const d = z
      .object({
        oeste: z.coerce.number().min(-180).max(180),
        sur: z.coerce.number().min(-90).max(90),
        este: z.coerce.number().min(-180).max(180),
        norte: z.coerce.number().min(-90).max(90),
      })
      .strict()
      .refine(
        (v) =>
          v.este > v.oeste &&
          v.norte > v.sur &&
          v.este - v.oeste <= 0.02 &&
          v.norte - v.sur <= 0.02,
        { message: 'Acerca el mapa: ventana máxima de 0,02 grados por lado.' },
      )
      .parse(req.query);
    const items = (
      await pool.query(
        `SELECT e.id,e.nombre,${geometry} FROM bagua_master.edificio e WHERE ST_Intersects(e.geom,ST_MakeEnvelope($1,$2,$3,$4,4326)) ORDER BY e.id LIMIT 31`,
        [d.oeste, d.sur, d.este, d.norte],
      )
    ).rows;
    res.json({
      items: items.slice(0, 30),
      hayMas: items.length > 30,
      criterio: 'interseccion_vista',
      aviso: 'Intersección con el área visible; no prueba correspondencia administrativa.',
    });
  });
  router.get('/espacial/edificios/:edificio', async (req, res) => {
    const id = z.string().min(1).max(150).parse(req.params.edificio);
    const row = (
      await pool.query(
        `SELECT e.id,e.nombre,${geometry} FROM bagua_master.edificio e WHERE e.id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Edificio Overture no encontrado.');
    res.json(row);
  });
  router.get('/predios/:id/espacial', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const predio = await transaction(pool, (c) => parent(c, id));
    const items = (
      await pool.query(
        `SELECT v.*,u.nombre AS proponente,r.nombre AS revisor,e.nombre AS nombre_edificio,${geometry},(SELECT count(*)::int FROM gestion.vinculo_espacial x WHERE x.edificio_id=v.edificio_id AND x.predio_id<>v.predio_id AND x.estado='confirmado') AS otros_confirmados FROM gestion.vinculo_espacial v JOIN bagua_master.edificio e ON e.id=v.edificio_id JOIN gestion.usuario u ON u.id=v.creado_por LEFT JOIN gestion.usuario r ON r.id=v.revisado_por WHERE v.predio_id=$1 ORDER BY v.creado_en,v.id`,
        [id],
      )
    ).rows;
    if ((res.locals.user as User).rol === 'consulta')
      for (const row of items) {
        delete row.proponente;
        delete row.revisor;
        delete row.creado_por;
        delete row.revisado_por;
      }
    res.json({
      predio,
      items,
      fuente: 'Overture Maps; referencia cartográfica, no catastro oficial',
    });
  });
  router.post('/predios/:id/espacial', async (req, res) => {
    const user = res.locals.user as User;
    if (user.rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no propone vínculos espaciales.');
    const id = z.uuid().parse(req.params.id),
      d = spatialProposal.parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        await parent(c, id, d.versionPredio);
        const row = (
          await c.query(
            `INSERT INTO gestion.vinculo_espacial(predio_id,edificio_id,criterio,evidencia,version_overture,creado_por) SELECT $1,e.id,$3,$4,v.version_overture,$5 FROM bagua_master.edificio e CROSS JOIN bagua_master.version v WHERE e.id=$2 AND v.id='bagua-master' RETURNING *`,
            [id, d.edificioId, d.criterio, d.evidencia, user.id],
          )
        ).rows[0];
        if (!row)
          throw new AppError(404, 'NOT_FOUND', 'Edificio o versión Overture no disponible.');
        await audit(c, user, id, 'espacial.propuesto', null, row);
        return row;
      }),
    );
  });
  router.patch('/predios/:id/espacial/:vinculo', async (req, res) => {
    const user = res.locals.user as User;
    if (user.rol !== 'administrador')
      throw new AppError(
        403,
        'FORBIDDEN',
        'Solo administración revisa vínculos en este entorno de prueba.',
      );
    const id = z.uuid().parse(req.params.id),
      link = z.uuid().parse(req.params.vinculo),
      d = spatialDecision.parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        await parent(c, id, d.versionPredio);
        const before = (
          await c.query(
            'SELECT * FROM gestion.vinculo_espacial WHERE id=$1 AND predio_id=$2 FOR UPDATE',
            [link, id],
          )
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Vínculo no encontrado.');
        if (before.version !== d.version)
          throw new AppError(409, 'SPATIAL_STALE', 'La revisión cambió; recarga antes de decidir.');
        const row = (
          await c.query(
            'UPDATE gestion.vinculo_espacial SET estado=$2,motivo=$3,compartido=$4,revisado_por=$5,revisado_en=now(),version=version+1 WHERE id=$1 RETURNING *',
            [link, d.estado, d.motivo, d.compartido, user.id],
          )
        ).rows[0];
        await audit(c, user, id, 'espacial.' + d.estado, before, row);
        return row;
      }),
    );
  });
  return router;
}
