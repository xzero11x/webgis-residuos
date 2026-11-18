import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';

export async function activeService(client: PoolClient, id: string) {
  const row = (
    await client.query('SELECT activo FROM gestion.servicio WHERE id=$1 FOR SHARE', [id])
  ).rows[0];
  if (!row?.activo)
    throw new AppError(
      400,
      'SERVICE_INACTIVE',
      'Selecciona un servicio activo del catálogo de prueba.',
    );
}
export function createCatalogRouter(pool: Pool) {
  const router = Router();
  router.get('/materiales', async (_req, res) =>
    res.json({
      items: (
        await pool.query(
          'SELECT id,codigo,nombre,activo FROM gestion.material WHERE activo ORDER BY nombre',
        )
      ).rows,
    }),
  );
  router.use((_req, res, next) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración puede configurar catálogos.');
    next();
  });
  router.get('/configuracion', async (_req, res) => {
    const [services, materials] = await Promise.all([
      pool.query('SELECT * FROM gestion.servicio ORDER BY nombre'),
      pool.query('SELECT * FROM gestion.material ORDER BY nombre'),
    ]);
    res.json({
      servicios: services.rows,
      materiales: materials.rows,
      aviso: 'Catálogos de prueba no oficiales. Las denominaciones se validarán con la Gerencia.',
    });
  });
  const kind = (type: unknown) =>
    ({ servicios: 'servicio', materiales: 'material' })[
      z.enum(['servicios', 'materiales']).parse(type)
    ];
  router.post('/:tipo', async (req, res) => {
    const table = kind(req.params.tipo);
    const input = z
      .object({
        codigo: z
          .string()
          .trim()
          .regex(/^TEST-[A-Z0-9_-]{1,50}$/),
        nombre: z.string().trim().min(2).max(120),
      })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        const row = (
          await c.query(`INSERT INTO gestion.${table}(codigo,nombre) VALUES($1,$2) RETURNING *`, [
            input.codigo,
            input.nombre,
          ])
        ).rows[0];
        await audit(c, res.locals.user, null, `catalogo.${table}.creado`, null, row);
        return row;
      }),
    );
  });
  router.patch('/:tipo/:id', async (req, res) => {
    const table = kind(req.params.tipo),
      id = z.uuid().parse(req.params.id);
    const input = z.object({ activo: z.boolean() }).strict().parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const before = (
          await c.query(`SELECT * FROM gestion.${table} WHERE id=$1 FOR UPDATE`, [id])
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Entrada de catálogo no encontrada.');
        const row = (
          await c.query(`UPDATE gestion.${table} SET activo=$2 WHERE id=$1 RETURNING *`, [
            id,
            input.activo,
          ])
        ).rows[0];
        await audit(c, res.locals.user, null, `catalogo.${table}.estado`, before, row);
        return row;
      }),
    );
  });
  return router;
}
