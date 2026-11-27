import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';

// Ajuste del servicio: cambios de programación con motivo y avisos que llegan al vecino (sticker y
// consulta por punto), al chofer (ruta del día) y al promotor (recorrido de campo).

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const noticeInput = z
  .object({
    tipo: z.enum(['suspension', 'cambio_horario', 'informativo']),
    titulo: z.string().trim().min(5).max(120),
    mensaje: z.string().trim().min(5).max(600),
    programaciones: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
    desde: day,
    hasta: day,
  })
  .strict()
  .refine((v) => v.hasta >= v.desde, {
    message: 'El aviso termina antes de empezar.',
    path: ['hasta'],
  });

export const scheduleChange = z
  .object({
    dias: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((d) => new Set(d).size === d.length, 'Días repetidos.'),
    horaInicio: hhmm,
    horaFin: hhmm,
    vehiculo: z.string().trim().max(80),
    vehiculoPlaca: z.string().trim().max(12).nullable().default(null),
    operador: z.string().trim().max(120),
    sectores: z.array(z.string().trim().min(2).max(60)).max(20),
    motivo: z.string().trim().min(5).max(300),
    desde: day,
    aviso: z
      .object({
        titulo: z.string().trim().min(5).max(120),
        mensaje: z.string().trim().min(5).max(600),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .refine((v) => v.horaFin > v.horaInicio, {
    message: 'La hora de fin debe ser posterior al inicio.',
    path: ['horaFin'],
  });

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const describeDays = (days: number[]) => {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d - 1]!);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]!;
};

export function createNoticesRouter(pool: Pool, auth: { write: RequestHandler }) {
  const router = Router();
  const staff: RequestHandler = (_req, res, next) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(403, 'FORBIDDEN', 'Tu perfil no publica avisos.');
    next();
  };

  router.get('/avisos', async (req, res) => {
    const q = z
      .object({ todos: z.enum(['0', '1']).default('0') })
      .strict()
      .parse(req.query);
    const rows = (
      await pool.query(
        `SELECT a.id,a.tipo,a.titulo,a.mensaje,a.programaciones,a.desde::text,a.hasta::text,a.retirado,
                a.motivo_retiro AS "motivoRetiro",a.creado_en AS "creadoEn",u.nombre AS "publicadoPor",
                (a.hasta >= (now() AT TIME ZONE 'America/Lima')::date AND NOT a.retirado) AS vigente
         FROM bagua_master.aviso_servicio a LEFT JOIN gestion.usuario u ON u.id=a.publicado_por
         WHERE $1 OR (NOT a.retirado AND a.hasta >= (now() AT TIME ZONE 'America/Lima')::date - 30)
         ORDER BY a.desde DESC,a.creado_en DESC LIMIT 200`,
        [q.todos === '1'],
      )
    ).rows;
    res.json({ items: rows });
  });

  router.post('/avisos', auth.write, staff, async (req, res) => {
    const d = noticeInput.parse(req.body);
    const user = res.locals.user as User;
    const row = await transaction(pool, async (c) => {
      if (d.programaciones.length) {
        const known = (
          await c.query('SELECT id FROM bagua_master.ruta_programacion WHERE id=ANY($1)', [
            d.programaciones,
          ])
        ).rows.map((r) => r.id as string);
        const unknown = d.programaciones.filter((p) => !known.includes(p));
        if (unknown.length)
          throw new AppError(400, 'UNKNOWN_PROGRAM', `Programación desconocida: ${unknown[0]}.`);
      }
      const created = (
        await c.query(
          `INSERT INTO bagua_master.aviso_servicio(tipo,titulo,mensaje,programaciones,desde,hasta,publicado_por)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,tipo,titulo,desde::text,hasta::text`,
          [d.tipo, d.titulo, d.mensaje, d.programaciones, d.desde, d.hasta, user.id],
        )
      ).rows[0];
      await audit(c, user, null, 'aviso.publicado', null, { ...created, ...d });
      return created;
    });
    res.status(201).json(row);
  });

  router.post('/avisos/:id/retirar', auth.write, staff, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = z
      .object({ motivo: z.string().trim().min(5).max(300) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const row = (
        await c.query(
          'UPDATE bagua_master.aviso_servicio SET retirado=true,motivo_retiro=$2 WHERE id=$1 AND NOT retirado RETURNING id,titulo',
          [id, d.motivo],
        )
      ).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Aviso no encontrado o ya retirado.');
      await audit(c, user, null, 'aviso.retirado', row, { motivo: d.motivo });
    });
    res.status(204).end();
  });

  router.get('/programaciones', async (_req, res) => {
    const rows = (
      await pool.query(
        `SELECT g.id,g.ruta_codigo AS ruta,r.nombre AS "rutaNombre",r.color,g.servicio,g.nombre,g.dias,
                to_char(g.hora_inicio,'HH24:MI') AS "horaInicio",to_char(g.hora_fin,'HH24:MI') AS "horaFin",g.turno,
                g.sectores,g.vehiculo,g.vehiculo_placa AS "vehiculoPlaca",g.operador,
                (SELECT count(*)::int FROM bagua_master.ruta_punto_control pc WHERE pc.programacion_id=g.id) AS puntos,
                (SELECT coalesce(json_agg(json_build_object('id',c.id,'motivo',c.motivo,'desde',c.desde,'creadoEn',c.creado_en,
                    'anterior',c.anterior,'nuevo',c.nuevo,'usuario',u.nombre) ORDER BY c.creado_en DESC),'[]')
                   FROM bagua_master.ruta_programacion_cambio c LEFT JOIN gestion.usuario u ON u.id=c.usuario_id
                  WHERE c.programacion_id=g.id) AS cambios
         FROM bagua_master.ruta_programacion g JOIN bagua_master.ruta r ON r.codigo=g.ruta_codigo
         WHERE g.vigente ORDER BY r.orden,g.servicio,g.id`,
      )
    ).rows;
    res.json({ items: rows });
  });

  router.put('/programaciones/:id', auth.write, async (req, res) => {
    const user = res.locals.user as User;
    if (user.rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración cambia la programación.');
    const id = z.string().trim().min(2).max(40).parse(req.params.id);
    const d = scheduleChange.parse(req.body);
    const row = await transaction(pool, async (c) => {
      const before = (
        await c.query(
          `SELECT id,nombre,dias,to_char(hora_inicio,'HH24:MI') AS "horaInicio",to_char(hora_fin,'HH24:MI') AS "horaFin",
                  vehiculo,vehiculo_placa AS "vehiculoPlaca",operador,sectores
           FROM bagua_master.ruta_programacion WHERE id=$1 AND vigente FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Programación no encontrada.');
      if (d.vehiculoPlaca) {
        const vehicle = (
          await c.query('SELECT placa FROM gestion.vehiculo WHERE placa=$1 AND activo', [
            d.vehiculoPlaca,
          ])
        ).rowCount;
        if (!vehicle) throw new AppError(400, 'UNKNOWN_VEHICLE', 'Vehículo no registrado.');
      }
      const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      const turno =
        minutes(d.horaInicio) < 720 ? 'mañana' : minutes(d.horaInicio) < 1140 ? 'tarde' : 'noche';
      const after = (
        await c.query(
          `UPDATE bagua_master.ruta_programacion SET dias=$2,hora_inicio=$3,hora_fin=$4,turno=$5,vehiculo=$6,
             vehiculo_placa=$7,operador=$8,sectores=$9 WHERE id=$1
           RETURNING id,nombre,dias,to_char(hora_inicio,'HH24:MI') AS "horaInicio",to_char(hora_fin,'HH24:MI') AS "horaFin",
             vehiculo,vehiculo_placa AS "vehiculoPlaca",operador,sectores`,
          [
            id,
            d.dias,
            d.horaInicio,
            d.horaFin,
            turno,
            d.vehiculo,
            d.vehiculoPlaca,
            d.operador,
            d.sectores,
          ],
        )
      ).rows[0];
      // Los puntos de control se corren con la ventana: misma proporción dentro del nuevo horario.
      if (before.horaInicio !== d.horaInicio || before.horaFin !== d.horaFin)
        await c.query(
          `UPDATE bagua_master.ruta_punto_control SET hora_programada =
             $2::time + (hora_programada - $4::time)
               * coalesce(extract(epoch FROM $3::time - $2::time) / nullif(extract(epoch FROM $5::time - $4::time),0), 1)
           WHERE programacion_id=$1`,
          [id, d.horaInicio, d.horaFin, before.horaInicio, before.horaFin],
        );
      let avisoId: string | null = null;
      if (d.aviso) {
        const end = new Date(`${d.desde}T12:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 21);
        avisoId = (
          await c.query(
            `INSERT INTO bagua_master.aviso_servicio(tipo,titulo,mensaje,programaciones,desde,hasta,publicado_por)
             VALUES('cambio_horario',$1,$2,$3,$4,$5,$6) RETURNING id`,
            [
              d.aviso.titulo,
              d.aviso.mensaje,
              [id],
              d.desde,
              end.toISOString().slice(0, 10),
              user.id,
            ],
          )
        ).rows[0].id;
      }
      await c.query(
        `INSERT INTO bagua_master.ruta_programacion_cambio(programacion_id,anterior,nuevo,motivo,desde,aviso_id,usuario_id)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, before, after, d.motivo, d.desde, avisoId, user.id],
      );
      await audit(c, user, null, 'programacion.cambiada', before, { ...after, motivo: d.motivo });
      return { ...after, avisoId };
    });
    res.json(row);
  });

  return router;
}
