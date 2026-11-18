import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import { administrativeInput, importFields } from './gestion.reconciliation.js';
import { predioInput, type User } from './gestion.schema.js';

export const reversalInput = z
  .object({
    clave: z.uuid(),
    motivo: z.string().trim().min(5).max(1000),
    cambios: z
      .array(
        z
          .object({
            id: z.uuid(),
            version: z.number().int().positive(),
            campos: z
              .array(z.enum(['alta', ...importFields]))
              .min(1)
              .max(7),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.cambios.map((c) => c.id)).size !== v.cambios.length ||
      v.cambios.some((c) => new Set(c.campos).size !== c.campos.length)
    )
      ctx.addIssue({ code: 'custom', message: 'Cambios o campos repetidos.' });
  });
const columns = {
  direccion: 'direccion',
  sector: 'sector',
  uso: 'uso',
  observaciones: 'observaciones',
  ubicacion: 'ubicacion',
  estadoUbicacion: 'estado_ubicacion',
  evidenciaUbicacion: 'evidencia_ubicacion',
} as const;
async function dependencies(c: PoolClient, id: string) {
  return (
    await c.query(
      `SELECT EXISTS(SELECT 1 FROM gestion.vinculo WHERE predio_id=$1 UNION ALL SELECT 1 FROM gestion.asignacion WHERE predio_id=$1 UNION ALL SELECT 1 FROM gestion.participacion WHERE predio_id=$1 UNION ALL SELECT 1 FROM gestion.unidad WHERE predio_id=$1 UNION ALL SELECT 1 FROM gestion.vinculo_espacial WHERE predio_id=$1) AS hay`,
      [id],
    )
  ).rows[0].hay as boolean;
}
function conflict(row: Record<string, unknown>, version: number) {
  return row.archivado
    ? 'El predio está archivado.'
    : row.version !== version
      ? 'El predio tiene modificaciones posteriores. No se sobrescriben.'
      : null;
}
export function createImportReversalRouter(pool: Pool) {
  const router = Router();
  router.use('/importaciones', (_req, res, next) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración revisa y revierte lotes.');
    next();
  });
  router.get('/importaciones', async (req, res) => {
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
      .strict()
      .parse(req.query);
    const rows = (
      await pool.query(
        `SELECT i.id,i.estado,i.creado_en,i.aplicado_en,i.metadatos->>'archivo' AS archivo,u.usuario AS responsable,
      (SELECT count(*)::int FROM gestion.importacion_cambio c WHERE c.lote_id=i.id) AS operaciones
      FROM gestion.importacion i JOIN gestion.usuario u ON u.id=i.usuario_id ORDER BY i.creado_en DESC,i.id LIMIT 31 OFFSET $1`,
        [(page - 1) * 30],
      )
    ).rows;
    res.json({ items: rows.slice(0, 30), hayMas: rows.length > 30, page });
  });
  router.get('/importaciones/:id/cambios', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json(
      await transaction(pool, async (c) => {
        const batch = (
          await c.query(
            'SELECT id,estado,creado_en,aplicado_en FROM gestion.importacion WHERE id=$1',
            [id],
          )
        ).rows[0];
        if (!batch) throw new AppError(404, 'NOT_FOUND', 'Lote no encontrado.');
        const rows = (
          await c.query('SELECT * FROM gestion.importacion_cambio WHERE lote_id=$1 ORDER BY id', [
            id,
          ])
        ).rows;
        const items = [];
        for (const change of rows) {
          const p = (await c.query('SELECT * FROM gestion.predio WHERE id=$1', [change.predio_id]))
            .rows[0];
          const blocked =
            conflict(p, change.version_esperada) ||
            (change.tipo === 'alta' && (await dependencies(c, p.id))
              ? 'El alta tiene relaciones posteriores; se conserva y requiere revisión.'
              : null);
          items.push({
            ...change,
            codigo: p.codigo,
            version: p.version,
            bloqueo: blocked,
            actual: administrativeInput(p),
          });
        }
        const reversions = (
          await c.query(
            `SELECT r.clave,r.motivo,r.creado_en,r.resultado,u.usuario AS responsable FROM gestion.importacion_reversion r JOIN gestion.usuario u ON u.id=r.usuario_id WHERE lote_id=$1 ORDER BY r.creado_en DESC`,
            [id],
          )
        ).rows;
        return { lote: batch, items, reversiones: reversions, manifestDisponible: rows.length > 0 };
      }),
    );
  });
  router.post('/importaciones/:id/revertir', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      data = reversalInput.parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext('gestion-import'))");
        const previous = (
          await c.query('SELECT * FROM gestion.importacion_reversion WHERE clave=$1', [data.clave])
        ).rows[0];
        const request = { motivo: data.motivo, cambios: data.cambios };
        if (previous) {
          const canonical = (v: unknown): string =>
            JSON.stringify(v, (_k, val) =>
              val && typeof val === 'object' && !Array.isArray(val)
                ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
                : val,
            );
          if (previous.lote_id !== id || canonical(previous.solicitud) !== canonical(request))
            throw new AppError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'La clave ya se usó para otra reversión.',
            );
          return { ...previous.resultado, repetida: true };
        }
        const batch = (
          await c.query('SELECT estado FROM gestion.importacion WHERE id=$1 FOR UPDATE', [id])
        ).rows[0];
        if (!batch) throw new AppError(404, 'NOT_FOUND', 'Lote no encontrado.');
        if (batch.estado !== 'aplicada')
          throw new AppError(409, 'BATCH_NOT_APPLIED', 'El lote no está aplicado.');
        const results = [];
        for (const selection of [...data.cambios].sort((a, b) => a.id.localeCompare(b.id))) {
          const change = (
            await c.query(
              'SELECT * FROM gestion.importacion_cambio WHERE id=$1 AND lote_id=$2 FOR UPDATE',
              [selection.id, id],
            )
          ).rows[0];
          if (!change)
            throw new AppError(
              400,
              'INVALID_CHANGE',
              'Operación ajena al lote o sin manifest verificable.',
            );
          if (
            selection.campos.some(
              (f) => !change.campos.includes(f) || change.revertidos.includes(f),
            )
          )
            throw new AppError(
              409,
              'ALREADY_REVERSED',
              'Campo ajeno o ya revertido. Recarga la revisión.',
            );
          const p = (
            await c.query('SELECT * FROM gestion.predio WHERE id=$1 FOR UPDATE', [change.predio_id])
          ).rows[0];
          const blocked = conflict(p, change.version_esperada);
          if (blocked || p.version !== selection.version)
            throw new AppError(
              409,
              'REVERSAL_STALE',
              blocked || 'La vista previa está desactualizada.',
            );
          let after;
          if (change.tipo === 'alta') {
            if (
              selection.campos.length !== 1 ||
              selection.campos[0] !== 'alta' ||
              (await dependencies(c, p.id))
            )
              throw new AppError(
                409,
                'REVERSAL_DEPENDENCIES',
                'El alta tiene dependencias. No se archiva automáticamente.',
              );
            after = (
              await c.query(
                'UPDATE gestion.predio SET archivado=true,motivo_archivo=$2,archivo_usuario=$3,archivo_fecha=now(),version=version+1,actualizado_en=now() WHERE id=$1 RETURNING *',
                [p.id, data.motivo, res.locals.user.id],
              )
            ).rows[0];
          } else {
            const merged = administrativeInput(p);
            for (const field of selection.campos) {
              if (field === 'alta') throw new AppError(400, 'INVALID_FIELD', 'Campo inválido.');
              Object.assign(merged, { [field]: change.anterior[field] });
            }
            predioInput.parse(merged);
            const fields = selection.campos as (keyof typeof columns)[];
            const values = fields.map((field) =>
              field === 'ubicacion' && merged[field]
                ? JSON.stringify(merged[field])
                : merged[field],
            );
            after = (
              await c.query(
                `UPDATE gestion.predio SET ${fields.map((field, i) => `${columns[field]}=$${i + 2}`).join(',')},version=version+1,actualizado_en=now() WHERE id=$1 RETURNING *`,
                [p.id, ...values],
              )
            ).rows[0];
          }
          await c.query(
            'UPDATE gestion.importacion_cambio SET revertidos=revertidos || $2::text[],version_esperada=$3 WHERE id=$1',
            [change.id, selection.campos, after.version],
          );
          await audit(c, res.locals.user, p.id, 'importacion.revertida', p, {
            ...after,
            lote: id,
            cambio: change.id,
            campos: selection.campos,
            motivo: data.motivo,
          });
          results.push({
            id: change.id,
            predio_id: p.id,
            campos: selection.campos,
            version: after.version,
          });
        }
        const result = { lote: id, operaciones: results, repetida: false };
        await c.query(
          'INSERT INTO gestion.importacion_reversion(clave,lote_id,usuario_id,motivo,solicitud,resultado) VALUES($1,$2,$3,$4,$5,$6)',
          [
            data.clave,
            id,
            res.locals.user.id,
            data.motivo,
            JSON.stringify(request),
            JSON.stringify(result),
          ],
        );
        return result;
      }),
    );
  });
  return router;
}
