import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { isValidCode, newCode, normalizeCode } from '../../shared/codigo-qr.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';
import { SELECTIVE } from './gestion.operacion.js';

// Códigos QR de los predios: resolver un sticker escaneado (con los programas del día y la visita
// de hoy), generar uno cuando falta, generar en lote para los inscritos, revocar un sticker
// perdido y listar etiquetas para imprimir. El QR no lleva datos personales.

const code = z
  .string()
  .max(12)
  .transform(normalizeCode)
  .refine(isValidCode, 'Código no válido: revisa los caracteres.');
export const qrRevokeInput = z
  .object({ motivo: z.string().trim().min(5).max(300), regenerar: z.boolean().default(true) })
  .strict();
export const qrBatchInput = z
  .object({ servicio: z.enum(['organicos', 'reciclables', 'todos']).default('todos') })
  .strict();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const KIND_BY_CODE: Record<string, 'organicos' | 'reciclables'> = Object.fromEntries(
  Object.entries(SELECTIVE).flatMap(([kind, v]) => v.codes.map((c) => [c, kind])),
) as Record<string, 'organicos' | 'reciclables'>;

export async function createCode(c: PoolClient, predioId: string, user: User) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const value = newCode();
    const row = (
      await c.query(
        `INSERT INTO gestion.codigo_qr(codigo,predio_id,generado_por) VALUES($1,$2,$3)
         ON CONFLICT (codigo) DO NOTHING RETURNING codigo,generado_en`,
        [value, predioId, user.id],
      )
    ).rows[0];
    if (row) return row as { codigo: string; generado_en: string };
  }
  throw new AppError(500, 'QR_COLLISION', 'No se pudo generar un código único.');
}

export function createQrRouter(pool: Pool, auth: { write: RequestHandler }) {
  const router = Router();

  // Etiquetas para imprimir: código, dirección y sector (sin datos personales).
  router.get('/qr/etiquetas', async (req, res) => {
    const q = z
      .object({
        servicio: z.enum(['organicos', 'reciclables', 'todos']).default('todos'),
        sector: z.string().max(80).optional(),
      })
      .strict()
      .parse(req.query);
    const codes =
      q.servicio === 'todos'
        ? [...SELECTIVE.organicos.codes, ...SELECTIVE.reciclables.codes]
        : [...SELECTIVE[q.servicio].codes];
    const rows = (
      await pool.query(
        `SELECT q.codigo,p.id AS "predioId",p.codigo AS "predioCodigo",p.direccion,p.sector,
                string_agg(DISTINCT a.codigo_padron, ' · ') AS padron
         FROM gestion.codigo_qr q JOIN gestion.predio p ON p.id=q.predio_id
         JOIN gestion.participacion a ON a.predio_id=p.id AND a.hasta IS NULL
         JOIN gestion.servicio s ON s.id=a.servicio_id AND s.codigo=ANY($1::text[])
         WHERE q.estado='activo' AND ($2::text IS NULL OR p.sector=$2)
         GROUP BY q.codigo,p.id ORDER BY p.sector,p.direccion`,
        [codes, q.sector ?? null],
      )
    ).rows;
    const pending = (
      await pool.query(
        `SELECT count(DISTINCT p.id)::int AS n FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id
         JOIN gestion.predio p ON p.id=a.predio_id AND NOT p.archivado
         WHERE s.codigo=ANY($1::text[]) AND a.hasta IS NULL AND ($2::text IS NULL OR p.sector=$2)
           AND NOT EXISTS (SELECT 1 FROM gestion.codigo_qr x WHERE x.predio_id=p.id AND x.estado='activo')`,
        [codes, q.sector ?? null],
      )
    ).rows[0].n;
    res.json({ etiquetas: rows, sinCodigo: pending });
  });

  // Sticker escaneado por un promotor: predio, programas activos, si toca hoy y la visita de hoy.
  router.get('/qr/:codigo', async (req, res) => {
    const codigo = code.parse(req.params.codigo);
    const fecha = day.optional().parse(req.query.fecha) ?? limaToday();
    const found = (
      await pool.query(
        `UPDATE gestion.codigo_qr q SET escaneos=escaneos+1,ultimo_escaneo=now()
         FROM gestion.predio p WHERE q.codigo=$1 AND p.id=q.predio_id
         RETURNING q.codigo,q.estado,p.id AS "predioId",p.codigo AS "predioCodigo",p.direccion,p.sector,p.archivado,
                   p.ubicacion`,
        [codigo],
      )
    ).rows[0];
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Este código no está registrado.');
    if (found.estado !== 'activo')
      throw new AppError(
        410,
        'QR_REVOKED',
        'Este sticker fue reemplazado. Usa el código nuevo del predio.',
      );
    const scheduled = found.ubicacion
      ? (
          await pool.query(
            `SELECT servicio,to_char(hora_estimada,'HH24:MI') AS hora FROM bagua_master.recoleccion_en_punto(
               ST_SetSRID(ST_GeomFromGeoJSON($1),4326))
             WHERE extract(isodow FROM $2::date)::smallint = ANY(dias)`,
            [JSON.stringify(found.ubicacion), fecha],
          )
        ).rows
      : [];
    const participations = (
      await pool.query(
        `SELECT a.id AS "participacionId",s.codigo AS "servicioCodigo",s.nombre AS servicio,
                a.codigo_padron AS "codigoPadron",a.tipo_generador AS "tipoGenerador",a.establecimiento,
                v.id AS "visitaId",v.resultado,
                (SELECT coalesce(json_agg(json_build_object('material',e.material,'cantidad',e.cantidad) ORDER BY e.material),'[]')
                   FROM gestion.entrega e WHERE e.visita_id=v.id AND NOT e.anulada) AS entregas
         FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id
         LEFT JOIN gestion.visita v ON v.participacion_id=a.id AND v.fecha=$2::date AND NOT v.anulada
         WHERE a.predio_id=$1 AND a.desde<=$2::date AND (a.hasta IS NULL OR a.hasta>=$2::date)
         ORDER BY s.nombre`,
        [found.predioId, fecha],
      )
    ).rows.map((p) => {
      const kind = KIND_BY_CODE[p.servicioCodigo as string];
      const today = scheduled.find((s) => s.servicio === kind);
      return {
        ...p,
        tipo: kind ?? null,
        programadoHoy: !!today,
        horaEstimada: today?.hora ?? null,
      };
    });
    res.json({
      codigo: found.codigo,
      fecha,
      predio: {
        id: found.predioId,
        codigo: found.predioCodigo,
        direccion: found.direccion,
        sector: found.sector,
        archivado: found.archivado,
      },
      participaciones: participations,
    });
  });

  // Código vigente de un predio (o ninguno) y su historial de stickers.
  router.get('/predios/:id/qr', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const rows = (
      await pool.query(
        `SELECT codigo,estado,generado_en AS "generadoEn",revocado_en AS "revocadoEn",motivo_revocacion AS motivo,
                escaneos,ultimo_escaneo AS "ultimoEscaneo"
         FROM gestion.codigo_qr WHERE predio_id=$1 ORDER BY generado_en DESC`,
        [id],
      )
    ).rows;
    res.json({ vigente: rows.find((r) => r.estado === 'activo') ?? null, historial: rows });
  });

  router.post('/predios/:id/qr', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const user = res.locals.user as User;
    const result = await transaction(pool, async (c) => {
      const predio = (
        await c.query('SELECT id,archivado FROM gestion.predio WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!predio) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
      if (predio.archivado) throw new AppError(409, 'ARCHIVED', 'El predio está archivado.');
      const current = (
        await c.query(
          "SELECT codigo FROM gestion.codigo_qr WHERE predio_id=$1 AND estado='activo'",
          [id],
        )
      ).rows[0];
      if (current) return { codigo: current.codigo as string, nuevo: false };
      const created = await createCode(c, id, user);
      await audit(c, user, id, 'qr.generado', null, created);
      return { codigo: created.codigo, nuevo: true };
    });
    res.status(result.nuevo ? 201 : 200).json(result);
  });

  router.post('/qr/:codigo/revocar', auth.write, async (req, res) => {
    const codigo = code.parse(req.params.codigo);
    const d = qrRevokeInput.parse(req.body);
    const user = res.locals.user as User;
    const result = await transaction(pool, async (c) => {
      const row = (
        await c.query(
          `UPDATE gestion.codigo_qr SET estado='revocado',revocado_por=$2,revocado_en=now(),motivo_revocacion=$3
           WHERE codigo=$1 AND estado='activo' RETURNING predio_id`,
          [codigo, user.id, d.motivo],
        )
      ).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Código no encontrado o ya revocado.');
      const replacement = d.regenerar ? await createCode(c, row.predio_id, user) : null;
      await audit(
        c,
        user,
        row.predio_id,
        'qr.revocado',
        { codigo },
        {
          motivo: d.motivo,
          reemplazo: replacement?.codigo ?? null,
        },
      );
      return { revocado: codigo, nuevo: replacement?.codigo ?? null };
    });
    res.json(result);
  });

  // Genera códigos para los participantes activos de los programas selectivos que aún no tienen.
  router.post('/qr/lote', auth.write, async (req, res) => {
    const d = qrBatchInput.parse(req.body ?? {});
    const codes =
      d.servicio === 'todos'
        ? [...SELECTIVE.organicos.codes, ...SELECTIVE.reciclables.codes]
        : [...SELECTIVE[d.servicio].codes];
    const user = res.locals.user as User;
    const created = await transaction(pool, async (c) => {
      const missing = (
        await c.query(
          `SELECT DISTINCT p.id FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id
           JOIN gestion.predio p ON p.id=a.predio_id AND NOT p.archivado
           WHERE s.codigo=ANY($1::text[]) AND a.hasta IS NULL
             AND NOT EXISTS (SELECT 1 FROM gestion.codigo_qr q WHERE q.predio_id=p.id AND q.estado='activo')`,
          [codes],
        )
      ).rows;
      for (const row of missing) await createCode(c, row.id, user);
      await audit(c, user, null, 'qr.lote', null, {
        servicio: d.servicio,
        generados: missing.length,
      });
      return missing.length;
    });
    res.status(201).json({ generados: created });
  });

  return router;
}
