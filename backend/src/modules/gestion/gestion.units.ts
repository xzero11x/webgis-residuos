import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';
import { period } from './gestion.schema.js';
export function createUnitsRouter(pool: Pool) {
  const router = Router();
  router.get('/unidades/buscar', async (req, res) => {
    const { q } = z
      .object({ q: z.string().trim().min(2).max(100) })
      .strict()
      .parse(req.query);
    const rows = (
      await pool.query(
        `SELECT u.id,u.codigo,u.nombre,u.tipo,u.predio_id,p.codigo AS predio_codigo,p.direccion
       FROM gestion.unidad u JOIN gestion.predio p ON p.id=u.predio_id
       WHERE u.activa AND NOT p.archivado AND
       (strpos(lower(u.codigo),lower($1))>0 OR strpos(lower(u.nombre),lower($1))>0 OR strpos(lower(p.codigo),lower($1))>0)
       ORDER BY u.codigo,u.id LIMIT 21`,
        [q],
      )
    ).rows;
    res.json({ items: rows.slice(0, 20), hayMas: rows.length > 20 });
  });
  router.get('/predios/:id/unidades/:unidad/relaciones', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      unit = z.uuid().parse(req.params.unidad),
      personal = (res.locals.user as User).rol !== 'consulta';
    const exists = await pool.query('SELECT id FROM gestion.unidad WHERE id=$1 AND predio_id=$2', [
      unit,
      id,
    ]);
    if (!exists.rowCount)
      throw new AppError(404, 'NOT_FOUND', 'La unidad no pertenece a este predio.');
    const rows = (
      await pool.query(
        `SELECT r.id,r.tipo,r.desde::text,r.hasta::text,r.evidencia,r.estado,r.version,s.nombre AS servicio${personal ? ',p.id AS persona_id,p.nombre AS persona,p.codigo AS persona_codigo' : ''} FROM gestion.relacion_unidad r JOIN gestion.unidad u ON u.id=r.unidad_id LEFT JOIN gestion.servicio s ON s.id=r.servicio_id ${personal ? 'LEFT JOIN gestion.persona p ON p.id=r.persona_id' : ''} WHERE r.unidad_id=$1 AND ($2 OR r.persona_id IS NULL) ORDER BY r.desde DESC,r.id`,
        [unit, personal],
      )
    ).rows;
    res.json({ items: rows, personasPermitidas: personal });
  });
  router.post('/predios/:id/unidades/:unidad/relaciones', async (req, res) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no registra relaciones.');
    const id = z.uuid().parse(req.params.id),
      unit = z.uuid().parse(req.params.unidad);
    const d = z
      .object({
        personaId: z.uuid().optional(),
        servicioId: z.uuid().optional(),
        tipo: z.enum([
          'contribuyente',
          'ocupante',
          'propietario_declarado',
          'responsable',
          'otro',
          'servicio',
        ]),
        estado: z.enum(['prevista', 'pendiente', 'confirmada']).optional(),
        periodo: period,
      })
      .strict()
      .refine(
        (v) =>
          v.tipo === 'servicio'
            ? !!v.servicioId && !v.personaId && !!v.estado
            : !!v.personaId && !v.servicioId && !v.estado,
        { message: 'Indica una persona y tipo o un servicio y estado; no ambos.' },
      )
      .parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        const exists = await c.query('SELECT id FROM gestion.unidad WHERE id=$1 AND predio_id=$2', [
          unit,
          id,
        ]);
        if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'Unidad ajena o inexistente.');
        const row = (
          await c.query(
            'INSERT INTO gestion.relacion_unidad(unidad_id,persona_id,servicio_id,tipo,desde,hasta,evidencia,estado,creado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [
              unit,
              d.personaId ?? null,
              d.servicioId ?? null,
              d.tipo,
              d.periodo.desde,
              d.periodo.hasta,
              d.periodo.evidencia,
              d.estado ?? null,
              (res.locals.user as User).id,
            ],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'unidad.relacion_creada', null, row);
        return row;
      }),
    );
  });
  router.post('/predios/:id/unidades/:unidad/relaciones/:relacion/cerrar', async (req, res) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no cierra relaciones.');
    const id = z.uuid().parse(req.params.id),
      unit = z.uuid().parse(req.params.unidad),
      relation = z.uuid().parse(req.params.relacion),
      d = z
        .object({
          hasta: z.iso.date(),
          version: z.number().int().positive(),
          motivo: z.string().trim().min(5).max(1000),
        })
        .strict()
        .parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const before = (
          await c.query(
            'SELECT r.* FROM gestion.relacion_unidad r JOIN gestion.unidad u ON u.id=r.unidad_id WHERE r.id=$1 AND r.unidad_id=$2 AND u.predio_id=$3 FOR UPDATE OF r',
            [relation, unit, id],
          )
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Relación no encontrada.');
        if (before.version !== d.version || before.hasta)
          throw new AppError(409, 'VERSION_CONFLICT', 'La relación cambió o ya está cerrada.');
        const after = (
          await c.query(
            'UPDATE gestion.relacion_unidad SET hasta=$2,version=version+1 WHERE id=$1 RETURNING *',
            [relation, d.hasta],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'unidad.relacion_cerrada', before, {
          ...after,
          motivo: d.motivo,
        });
        return after;
      }),
    );
  });
  router.get('/predios/:id/unidades', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json({
      items: (
        await pool.query('SELECT * FROM gestion.unidad WHERE predio_id=$1 ORDER BY codigo', [id])
      ).rows,
    });
  });
  router.post('/predios/:id/unidades', async (req, res) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no modifica unidades.');
    const id = z.uuid().parse(req.params.id),
      input = z
        .object({
          codigo: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_-]{1,60}$/),
          nombre: z.string().trim().min(1).max(120),
          tipo: z.enum(['unidad', 'seccion']),
          evidencia: z.string().trim().min(5).max(1000),
        })
        .strict()
        .parse(req.body);
    res.status(201).json(
      await transaction(pool, async (c) => {
        const row = (
          await c.query(
            'INSERT INTO gestion.unidad(predio_id,codigo,nombre,tipo,evidencia) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [id, input.codigo, input.nombre, input.tipo, input.evidencia],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'unidad.creada', null, row);
        return row;
      }),
    );
  });
  router.patch('/predios/:id/unidades/:unidad', async (req, res) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no modifica unidades.');
    const id = z.uuid().parse(req.params.id),
      unit = z.uuid().parse(req.params.unidad),
      input = z
        .object({
          nombre: z.string().trim().min(1).max(120),
          evidencia: z.string().trim().min(5).max(1000),
          activa: z.boolean(),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const parent = (
          await c.query('SELECT archivado FROM gestion.predio WHERE id=$1 FOR SHARE', [id])
        ).rows[0];
        if (!parent || parent.archivado)
          throw new AppError(
            409,
            'PREDIO_ARCHIVED',
            'Restaura el predio antes de modificar unidades.',
          );
        const before = (
          await c.query('SELECT * FROM gestion.unidad WHERE id=$1 AND predio_id=$2 FOR UPDATE', [
            unit,
            id,
          ])
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Unidad no encontrada.');
        if (before.version !== input.version)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'La unidad cambió. Recarga antes de guardar.',
          );
        const after = (
          await c.query(
            'UPDATE gestion.unidad SET nombre=$2,evidencia=$3,activa=$4,version=version+1 WHERE id=$1 RETURNING *',
            [unit, input.nombre, input.evidencia, input.activa],
          )
        ).rows[0];
        await audit(c, res.locals.user, id, 'unidad.actualizada', before, after);
        return after;
      }),
    );
  });
  return router;
}
