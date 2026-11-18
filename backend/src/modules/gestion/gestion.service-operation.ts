import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
export const serviceOperationFilter = z
  .object({
    tipo: z
      .enum(['asignaciones', 'participaciones', 'entregas', 'unidades'])
      .default('asignaciones'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export function createServiceOperationRouter(pool: Pool) {
  const router = Router();
  router.get('/servicios/:id/operacion', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      f = serviceOperationFilter.parse(req.query);
    const service = (
      await pool.query(
        'SELECT id,codigo,nombre,activo,sintetico FROM gestion.servicio WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!service) throw new AppError(404, 'NOT_FOUND', 'Servicio no encontrado.');
    // Solo campos operativos: nunca proyecciones de personas, observaciones libres o snapshots.
    const queries = {
      asignaciones: `SELECT r.id,p.id AS predio_id,p.codigo,p.direccion,p.archivado,r.desde::text,r.hasta::text,r.estado
        FROM gestion.asignacion r JOIN gestion.predio p ON p.id=r.predio_id WHERE r.servicio_id=$1 ORDER BY r.desde DESC,r.id`,
      participaciones: `SELECT r.id,p.id AS predio_id,p.codigo,p.direccion,p.archivado,r.desde::text,r.hasta::text
        FROM gestion.participacion r JOIN gestion.predio p ON p.id=r.predio_id WHERE r.servicio_id=$1 ORDER BY r.desde DESC,r.id`,
      entregas: `SELECT e.id,p.id AS predio_id,p.codigo,p.direccion,p.archivado,e.fecha::text,e.material,e.cantidad::text,e.unidad,e.anulada
        FROM gestion.entrega e JOIN gestion.participacion r ON r.id=e.participacion_id JOIN gestion.predio p ON p.id=r.predio_id
        WHERE r.servicio_id=$1 ORDER BY e.fecha DESC,e.id`,
      unidades: `SELECT r.id,p.id AS predio_id,p.codigo,p.direccion,p.archivado,r.desde::text,r.hasta::text,r.estado,u.id AS unidad_id,u.codigo AS unidad_codigo,u.nombre AS unidad_nombre,u.activa AS unidad_activa
        FROM gestion.relacion_unidad r JOIN gestion.unidad u ON u.id=r.unidad_id JOIN gestion.predio p ON p.id=u.predio_id
        WHERE r.servicio_id=$1 ORDER BY r.desde DESC,r.id`,
    };
    const rows = (
      await pool.query(queries[f.tipo] + ' LIMIT 26 OFFSET $2', [id, (f.page - 1) * 25])
    ).rows;
    res.json({
      servicio: service,
      tipo: f.tipo,
      items: rows.slice(0, 25),
      hayMas: rows.length > 25,
      page: f.page,
      pageSize: 25,
    });
  });
  return router;
}
