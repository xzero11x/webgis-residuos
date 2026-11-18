import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';
export const deliveryCorrection = z
  .object({
    version: z.number().int().positive(),
    motivo: z.string().trim().min(5).max(1000),
    fecha: z.iso.date(),
    material: z.string().trim().min(1).max(120),
    cantidad: z.number().finite().positive().max(1000000).nullable(),
    unidad: z.enum(['kg', 'unidad']).nullable(),
    observaciones: z.string().trim().max(1000),
  })
  .strict()
  .refine((v) => (v.cantidad === null) === (v.unidad === null), {
    message: 'Cantidad y unidad deben indicarse juntas o ambas sin información.',
    path: ['cantidad'],
  });
export function createDeliveryCorrectionsRouter(pool: Pool) {
  const router = Router();
  router.get('/entregas/:id/revisiones', async (req, res) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no consulta revisiones operativas.');
    const id = z.uuid().parse(req.params.id);
    const exists = await pool.query('SELECT id FROM gestion.entrega WHERE id=$1', [id]);
    if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'Entrega no encontrada.');
    res.json({
      items: (
        await pool.query(
          `SELECT r.id::text,r.version,r.motivo,r.creado_en,u.usuario AS responsable,
    jsonb_build_object('fecha',r.anterior->'fecha','material',r.anterior->'material','cantidad',r.anterior->'cantidad','unidad',r.anterior->'unidad','anulada',r.anterior->'anulada') AS anterior,
    jsonb_build_object('fecha',r.nuevo->'fecha','material',r.nuevo->'material','cantidad',r.nuevo->'cantidad','unidad',r.nuevo->'unidad','anulada',r.nuevo->'anulada') AS nuevo
    FROM gestion.entrega_revision r JOIN gestion.usuario u ON u.id=r.usuario_id WHERE r.entrega_id=$1 ORDER BY r.version DESC`,
          [id],
        )
      ).rows,
    });
  });
  router.patch('/entregas/:id', async (req, res) => {
    const user = res.locals.user as User;
    if (user.rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no corrige entregas.');
    const id = z.uuid().parse(req.params.id),
      d = deliveryCorrection.parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        const before = (
          await c.query(
            'SELECT e.*,p.predio_id FROM gestion.entrega e JOIN gestion.participacion p ON p.id=e.participacion_id WHERE e.id=$1 FOR UPDATE OF e',
            [id],
          )
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Entrega no encontrada.');
        if (before.anulada)
          throw new AppError(
            409,
            'ALREADY_VOID',
            'La entrega anulada conserva su evidencia y no se corrige.',
          );
        if (before.version !== d.version)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'La entrega cambió. Recarga antes de corregir.',
          );
        const after = (
          await c.query(
            `UPDATE gestion.entrega SET fecha=$2,material=$3,cantidad=$4,unidad=$5,observaciones=$6,
     motivo_cambio=$7,usuario_cambio=$8,version=version+1 WHERE id=$1 RETURNING *`,
            [id, d.fecha, d.material, d.cantidad, d.unidad, d.observaciones, d.motivo, user.id],
          )
        ).rows[0];
        await audit(c, user, before.predio_id, 'entrega.corregida', before, after);
        return after;
      }),
    );
  });
  return router;
}
