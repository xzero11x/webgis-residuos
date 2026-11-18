import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import type { User } from './gestion.schema.js';

export const auditFilter = z
  .object({
    antes: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .refine((value) => /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n)
      .optional(),
    accion: z.string().trim().max(100).default(''),
    predio: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

export function createAuditRouter(pool: Pool) {
  const router = Router();
  router.get('/auditoria', async (req, res) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración consulta la auditoría global.');
    const f = auditFilter.parse(req.query);
    // Proyección deliberada: no entregar snapshots que pueden contener datos personales.
    const rows = (
      await pool.query(
        `SELECT h.id::text,h.accion,h.creado_en,h.predio_id,p.codigo AS predio_codigo,
       u.usuario AS responsable FROM gestion.historial h
       JOIN gestion.usuario u ON u.id=h.usuario_id
       LEFT JOIN gestion.predio p ON p.id=h.predio_id
       WHERE ($1::bigint IS NULL OR h.id<$1) AND ($2='' OR h.accion=$2)
       AND ($3::uuid IS NULL OR h.predio_id=$3)
       ORDER BY h.id DESC LIMIT $4`,
        [f.antes ?? null, f.accion, f.predio ?? null, f.limite + 1],
      )
    ).rows;
    const items = rows.slice(0, f.limite);
    res.json({ items, siguiente: rows.length > f.limite ? items.at(-1)!.id : null });
  });
  return router;
}
