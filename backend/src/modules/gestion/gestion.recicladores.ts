import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';

// Recicladores formalizados (Ley 29419 y su reglamento, DS 005-2010-MINAM): la organización con su
// RUC y su registro municipal vigente, y el padrón de socios con carnet, capacitación, vacunas y
// equipo de protección. Lo que la Gerencia debe poder mostrar cuando le preguntan si los
// recicladores con los que trabaja están formalizados.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const actorUpdate = z
  .object({
    ruc: z
      .string()
      .regex(/^(10|20)\d{9}$/)
      .nullable(),
    registroNumero: z.string().trim().max(80).nullable(),
    registroDesde: day.nullable(),
    registroHasta: day.nullable(),
    representante: z.string().trim().max(160).nullable(),
    zona: z.string().trim().max(160).nullable(),
  })
  .strict()
  .refine((v) => !v.registroDesde || !v.registroHasta || v.registroHasta >= v.registroDesde, {
    message: 'La vigencia termina antes de empezar.',
    path: ['registroHasta'],
  });
export const memberInput = z
  .object({
    nombre: z.string().trim().min(5).max(160),
    documento: z
      .string()
      .regex(/^\d{8}$/)
      .nullable()
      .default(null),
    carnet: z.string().trim().max(40).nullable().default(null),
    desde: day,
    capacitado: z.boolean().default(false),
    vacunado: z.boolean().default(false),
    epp: z.boolean().default(false),
  })
  .strict();

export function createRecyclersRouter(
  pool: Pool,
  auth: { write: RequestHandler; privateData: RequestHandler },
) {
  const router = Router();

  router.get('/recicladores/actores', async (_req, res) => {
    const rows = (
      await pool.query(
        `SELECT a.id,a.codigo,a.nombre,a.tipo,a.registro,a.socios,a.vigente,a.ruc,a.registro_numero AS "registroNumero",
                a.registro_desde::text AS "registroDesde",a.registro_hasta::text AS "registroHasta",a.representante,a.zona,
                (a.registro_hasta - (now() AT TIME ZONE 'America/Lima')::date) AS "diasVigencia",
                count(r.id) FILTER (WHERE r.hasta IS NULL)::int AS activos,
                count(r.id) FILTER (WHERE r.hasta IS NULL AND r.capacitado)::int AS capacitados,
                count(r.id) FILTER (WHERE r.hasta IS NULL AND r.vacunado)::int AS vacunados,
                count(r.id) FILTER (WHERE r.hasta IS NULL AND r.epp)::int AS "conEpp",
                count(r.id) FILTER (WHERE r.hasta IS NULL AND r.carnet IS NOT NULL)::int AS "conCarnet",
                (SELECT coalesce(sum(v.toneladas),0)::float8 FROM gestion.valorizacion v
                  WHERE v.actor_id=a.id AND NOT v.anulada AND v.fecha >= (now() AT TIME ZONE 'America/Lima')::date - 365) AS "toneladasAnio"
         FROM gestion.actor a LEFT JOIN gestion.reciclador r ON r.actor_id=a.id
         GROUP BY a.id ORDER BY a.vigente DESC,a.tipo,a.nombre`,
      )
    ).rows;
    res.json({ items: rows });
  });

  router.put('/recicladores/actores/:id', auth.write, async (req, res) => {
    const user = res.locals.user as User;
    if (user.rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración cambia el registro de un actor.');
    const id = z.uuid().parse(req.params.id);
    const d = actorUpdate.parse(req.body);
    const row = await transaction(pool, async (c) => {
      const before = (await c.query('SELECT * FROM gestion.actor WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Actor no encontrado.');
      const after = (
        await c.query(
          `UPDATE gestion.actor SET ruc=$2,registro_numero=$3,registro_desde=$4,registro_hasta=$5,representante=$6,zona=$7
           WHERE id=$1 RETURNING id,nombre,ruc,registro_numero,registro_desde::text,registro_hasta::text,representante,zona`,
          [id, d.ruc, d.registroNumero, d.registroDesde, d.registroHasta, d.representante, d.zona],
        )
      ).rows[0];
      await audit(c, user, null, 'actor.actualizado', before, after);
      return after;
    });
    res.json(row);
  });

  router.get('/recicladores/actores/:id/socios', auth.privateData, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json({
      items: (
        await pool.query(
          `SELECT id,nombre,CASE WHEN documento IS NULL THEN NULL ELSE '•••••' || right(documento,3) END AS documento,
                  carnet,desde::text,hasta::text,capacitado,vacunado,epp
           FROM gestion.reciclador WHERE actor_id=$1 ORDER BY hasta IS NOT NULL,nombre`,
          [id],
        )
      ).rows,
    });
  });

  router.post('/recicladores/actores/:id/socios', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = memberInput.parse(req.body);
    const user = res.locals.user as User;
    const row = await transaction(pool, async (c) => {
      const actor = (await c.query('SELECT tipo FROM gestion.actor WHERE id=$1 AND vigente', [id]))
        .rows[0];
      if (!actor) throw new AppError(404, 'NOT_FOUND', 'Actor no encontrado.');
      if (actor.tipo !== 'asociacion_recicladores')
        throw new AppError(
          400,
          'NOT_ASSOCIATION',
          'Solo las asociaciones de recicladores tienen socios.',
        );
      const created = (
        await c.query(
          `INSERT INTO gestion.reciclador(actor_id,nombre,documento,carnet,desde,capacitado,vacunado,epp)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,nombre,carnet,desde::text`,
          [id, d.nombre, d.documento, d.carnet, d.desde, d.capacitado, d.vacunado, d.epp],
        )
      ).rows[0];
      await c.query(
        'UPDATE gestion.actor SET socios=(SELECT count(*) FROM gestion.reciclador WHERE actor_id=$1 AND hasta IS NULL) WHERE id=$1',
        [id],
      );
      await audit(c, user, null, 'reciclador.registrado', null, { actor: id, ...created });
      return created;
    });
    res.status(201).json(row);
  });

  router.put('/recicladores/socios/:id', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = z
      .object({
        carnet: z.string().trim().max(40).nullable(),
        capacitado: z.boolean(),
        vacunado: z.boolean(),
        epp: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    const row = await transaction(pool, async (c) => {
      const before = (
        await c.query('SELECT * FROM gestion.reciclador WHERE id=$1 AND hasta IS NULL FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Socio no encontrado o dado de baja.');
      const after = (
        await c.query(
          'UPDATE gestion.reciclador SET carnet=$2,capacitado=$3,vacunado=$4,epp=$5 WHERE id=$1 RETURNING id,carnet,capacitado,vacunado,epp',
          [id, d.carnet, d.capacitado, d.vacunado, d.epp],
        )
      ).rows[0];
      await audit(
        c,
        user,
        null,
        'reciclador.actualizado',
        {
          carnet: before.carnet,
          capacitado: before.capacitado,
          vacunado: before.vacunado,
          epp: before.epp,
        },
        after,
      );
      return after;
    });
    res.json(row);
  });

  router.post('/recicladores/socios/:id/baja', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = z.object({ hasta: day }).strict().parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const row = (
        await c.query(
          `UPDATE gestion.reciclador SET hasta=$2 WHERE id=$1 AND hasta IS NULL AND desde <= $2::date RETURNING actor_id,nombre`,
          [id, d.hasta],
        )
      ).rows[0];
      if (!row)
        throw new AppError(
          409,
          'INVALID',
          'El socio no existe, ya fue dado de baja o la fecha es anterior a su ingreso.',
        );
      await c.query(
        'UPDATE gestion.actor SET socios=(SELECT count(*) FROM gestion.reciclador WHERE actor_id=$1 AND hasta IS NULL) WHERE id=$1',
        [row.actor_id],
      );
      await audit(c, user, null, 'reciclador.baja', { id, nombre: row.nombre }, { hasta: d.hasta });
    });
    res.status(204).end();
  });

  return router;
}
