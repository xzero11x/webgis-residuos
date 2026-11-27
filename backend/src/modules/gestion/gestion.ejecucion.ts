import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import { assertOpenPeriod } from './gestion.periodo.js';
import type { User } from './gestion.schema.js';

// Ejecución de las rutas de recolección: el chofer marca desde el celular la salida, el paso por los
// puntos de control y la llegada al destino; la oficina registra el ticket de la balanza. Con eso el
// supervisor ve cada mañana qué rutas salieron, cuáles van atrasadas y qué falta pesar, y el
// reporte del mes sale de toneladas pesadas, no estimadas.

export const DESTINO = {
  convencional: 'relleno',
  comercial: 'relleno',
  organicos: 'planta',
  reciclables: 'acopio',
} as const;
export type Servicio = keyof typeof DESTINO;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.iso.datetime({ offset: true });
const coords = {
  lon: z.number().min(-78.75).max(-78.3).optional(),
  lat: z.number().min(-5.9).max(-5.4).optional(),
  precision: z.number().min(0).max(5000).optional(),
};
export const limaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const limaMinutes = (date = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .split(':')
    .map(Number);
  return h! * 60 + m!;
};
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** «Recolección convencional · Ruta 1001» → «Ruta 1001». */
const shortName = (name: string | null) => {
  const s = (name ?? '')
    .replace(/^Recolección convencional · /, '')
    .replace(/^Recolección selectiva de /, '')
    .replace(/^Recolección /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const dayText = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()}`;
};

export const startInput = z
  .object({
    clave: z.uuid(),
    programacionId: z.string().trim().min(2).max(40),
    fecha: day,
    momento: instant,
    vehiculo: z.string().trim().max(80).optional(),
    ...coords,
  })
  .strict();
export const eventInput = z
  .object({
    clave: z.uuid(),
    tipo: z.enum(['paso', 'llegada']),
    momento: instant,
    puntoId: z.string().trim().min(2).max(60).optional(),
    nota: z.string().trim().max(300).default(''),
    ...coords,
  })
  .strict()
  .refine((v) => v.tipo === 'paso' || !v.puntoId, {
    message: 'La llegada no corresponde a un punto de control.',
    path: ['puntoId'],
  });
export const weighingInput = z
  .object({
    ejecucionId: z.uuid().nullable().default(null),
    destino: z.enum(['relleno', 'planta', 'acopio']).default('relleno'),
    fecha: day,
    hora: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .default(null),
    ticket: z.string().trim().min(2).max(40),
    vehiculo: z.string().trim().min(2).max(80),
    pesoBrutoKg: z.number().positive().max(60000),
    taraKg: z.number().min(0).max(40000),
    observaciones: z.string().trim().max(300).default(''),
  })
  .strict()
  .refine((v) => v.pesoBrutoKg > v.taraKg, {
    message: 'El peso bruto debe ser mayor que la tara.',
    path: ['pesoBrutoKg'],
  });

/** Estado de una programación en un día, visto por el supervisor. */
export function programStatus(
  fecha: string,
  today: string,
  nowMinutes: number,
  horaInicio: string,
  estado: string | null,
  suspendida = false,
) {
  if (estado) return estado;
  if (suspendida) return 'suspendida';
  if (fecha < today) return 'no_ejecutada';
  if (fecha > today) return 'programada';
  const start = toMinutes(horaInicio);
  if (nowMinutes < start) return 'pendiente';
  return nowMinutes >= start + 20 ? 'sin_iniciar' : 'por_iniciar';
}

function checkMoment(fecha: string, momento: string) {
  const at = new Date(momento).getTime();
  const from = new Date(`${fecha}T00:00:00-05:00`).getTime();
  const to = new Date(`${shiftDay(fecha, 1)}T12:00:00-05:00`).getTime();
  if (at < from || at > to)
    throw new AppError(400, 'INVALID_TIME', 'La hora no corresponde al día de la ruta.');
  if (at > Date.now() + 5 * 60_000)
    throw new AppError(400, 'INVALID_TIME', 'La hora del registro está en el futuro.');
}

const point = (lon?: number, lat?: number) =>
  lon === undefined || lat === undefined ? null : JSON.stringify([lon, lat]);
const geomSql = `CASE WHEN $X::text IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(($X::json->>0)::float8,($X::json->>1)::float8),4326) END`;
const geomAt = (n: number) => geomSql.replaceAll('$X', `$${n}`);

async function loadExecution(c: PoolClient, id: string) {
  const row = (
    await c.query(
      // La ruta se identifica por su id o por la clave con la que el celular registró la salida
      // (así los pasos registrados sin conexión no necesitan esperar la respuesta del servidor).
      `SELECT e.*,e.fecha::text AS fecha_texto FROM gestion.ruta_ejecucion e WHERE e.id=$1 OR e.clave=$1 FOR UPDATE`,
      [id],
    )
  ).rows[0];
  if (!row || row.anulada) throw new AppError(404, 'NOT_FOUND', 'Ejecución no encontrada.');
  return row;
}

export function createExecutionRouter(
  pool: Pool,
  auth: { write: RequestHandler; privateData: RequestHandler },
) {
  const router = Router();

  // ---------------------------------------------------------------- chofer: rutas del día
  router.get('/ruta/dia', async (req, res) => {
    const q = z.object({ fecha: day.optional() }).strict().parse(req.query);
    const fecha = q.fecha ?? limaToday();
    const rows = (
      await pool.query(
        `SELECT g.id,g.ruta_codigo AS ruta,r.nombre AS "rutaNombre",r.color,g.servicio,g.nombre,
                to_char(g.hora_inicio,'HH24:MI') AS "horaInicio",to_char(g.hora_fin,'HH24:MI') AS "horaFin",
                g.vehiculo,g.vehiculo_placa AS "vehiculoPlaca",g.operador,g.sectores,
                (SELECT coalesce(json_agg(json_build_object('id',pc.id,'orden',pc.orden,'nombre',pc.nombre,
                    'hora',to_char(pc.hora_programada,'HH24:MI'),'lon',ST_X(pc.geom),'lat',ST_Y(pc.geom)) ORDER BY pc.orden),'[]')
                   FROM bagua_master.ruta_punto_control pc WHERE pc.programacion_id=g.id) AS puntos,
                (SELECT json_build_object('id',e.id,'estado',e.estado,'conductor',u.nombre,
                    'motivoInterrupcion',e.motivo_interrupcion,
                    'eventos',(SELECT coalesce(json_agg(json_build_object('id',x.id,'tipo',x.tipo,'momento',x.momento,
                        'puntoId',x.punto_id,'destino',x.destino) ORDER BY x.momento),'[]')
                      FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id))
                   FROM gestion.ruta_ejecucion e JOIN gestion.usuario u ON u.id=e.conductor_id
                  WHERE e.programacion_id=g.id AND e.fecha=$1 AND NOT e.anulada) AS ejecucion
         FROM bagua_master.ruta_programacion g JOIN bagua_master.ruta r ON r.codigo=g.ruta_codigo
         WHERE g.vigente AND extract(isodow FROM $1::date)::smallint = ANY(g.dias)
         ORDER BY g.hora_inicio,g.id`,
        [fecha],
      )
    ).rows;
    const notices = (
      await pool.query(
        `SELECT id,tipo,titulo,mensaje,programaciones,desde::text,hasta::text FROM bagua_master.aviso_servicio
         WHERE NOT retirado AND hasta >= $1::date AND desde <= $1::date + 7 ORDER BY desde,creado_en`,
        [fecha],
      )
    ).rows;
    res.json({
      fecha,
      programas: rows.map((r) => ({ ...r, destino: DESTINO[r.servicio as Servicio] })),
      avisos: notices,
    });
  });

  router.post('/ruta/salida', auth.write, async (req, res) => {
    const d = startInput.parse(req.body);
    const user = res.locals.user as User;
    if (d.fecha > limaToday() || d.fecha < shiftDay(limaToday(), -3))
      throw new AppError(
        400,
        'INVALID_DATE',
        'Solo se registra la ruta de hoy o de días recientes.',
      );
    checkMoment(d.fecha, d.momento);
    const repeated = (
      await pool.query('SELECT id,estado FROM gestion.ruta_ejecucion WHERE clave=$1', [d.clave])
    ).rows[0];
    if (repeated) return res.json({ ...repeated, repetida: true });
    const created = await transaction(pool, async (c) => {
      await assertOpenPeriod(c, d.fecha);
      const prog = (
        await c.query(
          'SELECT id,ruta_codigo,servicio,vehiculo FROM bagua_master.ruta_programacion WHERE id=$1 AND vigente',
          [d.programacionId],
        )
      ).rows[0];
      if (!prog) throw new AppError(404, 'NOT_FOUND', 'Programación no encontrada.');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${prog.id}|${d.fecha}`]);
      const active = (
        await c.query(
          'SELECT id FROM gestion.ruta_ejecucion WHERE programacion_id=$1 AND fecha=$2 AND NOT anulada',
          [prog.id, d.fecha],
        )
      ).rows[0];
      if (active)
        throw new AppError(409, 'ALREADY_STARTED', 'Esta ruta ya tiene su salida registrada hoy.');
      const row = (
        await c.query(
          `INSERT INTO gestion.ruta_ejecucion(programacion_id,ruta_codigo,servicio,fecha,vehiculo,conductor_id,clave)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,estado,fecha::text`,
          [
            prog.id,
            prog.ruta_codigo,
            prog.servicio,
            d.fecha,
            d.vehiculo || prog.vehiculo,
            user.id,
            d.clave,
          ],
        )
      ).rows[0];
      await c.query(
        `INSERT INTO gestion.ruta_evento(ejecucion_id,tipo,momento,geom,precision_m,clave)
         VALUES($1,'salida',$2,${geomAt(3)},$4,gen_random_uuid())`,
        [row.id, d.momento, point(d.lon, d.lat), d.precision ?? null],
      );
      await audit(c, user, null, 'ruta.salida', null, { ...row, programacion: prog.id });
      return row;
    });
    res.status(201).json(created);
  });

  router.post('/ruta/ejecuciones/:id/eventos', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = eventInput.parse(req.body);
    const user = res.locals.user as User;
    const repeated = (
      await pool.query('SELECT id,tipo FROM gestion.ruta_evento WHERE clave=$1', [d.clave])
    ).rows[0];
    if (repeated) return res.json({ ...repeated, repetido: true });
    const created = await transaction(pool, async (c) => {
      const e = await loadExecution(c, id);
      await assertOpenPeriod(c, e.fecha_texto);
      if (e.estado === 'interrumpida')
        throw new AppError(409, 'INTERRUPTED', 'La ruta está interrumpida. Reanúdala primero.');
      checkMoment(e.fecha_texto, d.momento);
      const start = (
        await c.query(
          "SELECT momento FROM gestion.ruta_evento WHERE ejecucion_id=$1 AND tipo='salida' ORDER BY momento LIMIT 1",
          [e.id],
        )
      ).rows[0];
      if (start && new Date(d.momento) < new Date(start.momento))
        throw new AppError(400, 'INVALID_TIME', 'El registro es anterior a la salida.');
      let punto: string | null = null;
      if (d.tipo === 'paso') {
        if (!d.puntoId)
          throw new AppError(
            400,
            'POINT_REQUIRED',
            'Indica el punto de control por el que pasaste.',
          );
        const known = (
          await c.query(
            'SELECT id FROM bagua_master.ruta_punto_control WHERE id=$1 AND programacion_id=$2',
            [d.puntoId, e.programacion_id],
          )
        ).rows[0];
        if (!known) throw new AppError(400, 'UNKNOWN_POINT', 'Ese punto no pertenece a esta ruta.');
        const already = (
          await c.query(
            "SELECT 1 FROM gestion.ruta_evento WHERE ejecucion_id=$1 AND tipo='paso' AND punto_id=$2",
            [e.id, d.puntoId],
          )
        ).rowCount;
        if (already)
          throw new AppError(409, 'DUPLICATE', 'Ese punto ya quedó registrado en esta ruta.');
        punto = d.puntoId;
      }
      const destino = d.tipo === 'llegada' ? DESTINO[e.servicio as Servicio] : null;
      const row = (
        await c.query(
          `INSERT INTO gestion.ruta_evento(ejecucion_id,tipo,momento,punto_id,destino,geom,precision_m,nota,clave)
           VALUES($1,$2,$3,$4,$5,${geomAt(6)},$7,$8,$9) RETURNING id,tipo,momento,punto_id AS "puntoId",destino`,
          [
            e.id,
            d.tipo,
            d.momento,
            punto,
            destino,
            point(d.lon, d.lat),
            d.precision ?? null,
            d.nota,
            d.clave,
          ],
        )
      ).rows[0];
      const estado = d.tipo === 'llegada' ? 'completada' : 'en_curso';
      if (estado !== e.estado)
        await c.query('UPDATE gestion.ruta_ejecucion SET estado=$2 WHERE id=$1', [e.id, estado]);
      await audit(c, user, null, `ruta.${d.tipo}`, null, { ejecucion: e.id, ...row });
      return { ...row, estado };
    });
    res.status(201).json(created);
  });

  router.post('/ruta/ejecuciones/:id/interrumpir', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = z
      .object({ motivo: z.string().trim().min(3).max(300) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    const row = await transaction(pool, async (c) => {
      const e = await loadExecution(c, id);
      await assertOpenPeriod(c, e.fecha_texto);
      const after = (
        await c.query(
          'UPDATE gestion.ruta_ejecucion SET estado=\'interrumpida\',motivo_interrupcion=$2 WHERE id=$1 RETURNING id,estado,motivo_interrupcion AS "motivoInterrupcion"',
          [e.id, d.motivo],
        )
      ).rows[0];
      await audit(c, user, null, 'ruta.interrumpida', { estado: e.estado }, after);
      return after;
    });
    res.json(row);
  });

  router.post('/ruta/ejecuciones/:id/reanudar', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const user = res.locals.user as User;
    const row = await transaction(pool, async (c) => {
      const e = await loadExecution(c, id);
      await assertOpenPeriod(c, e.fecha_texto);
      if (e.estado !== 'interrumpida')
        throw new AppError(409, 'NOT_INTERRUPTED', 'La ruta no está interrumpida.');
      const after = (
        await c.query(
          "UPDATE gestion.ruta_ejecucion SET estado='en_curso',motivo_interrupcion=NULL WHERE id=$1 RETURNING id,estado",
          [e.id],
        )
      ).rows[0];
      await audit(c, user, null, 'ruta.reanudada', { motivo: e.motivo_interrupcion }, after);
      return after;
    });
    res.json(row);
  });

  router.post('/ruta/ejecuciones/:id/anular', auth.write, async (req, res) => {
    const user = res.locals.user as User;
    if (user.rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración anula una ejecución.');
    const id = z.uuid().parse(req.params.id);
    const d = z
      .object({ motivo: z.string().trim().min(5).max(300) })
      .strict()
      .parse(req.body);
    await transaction(pool, async (c) => {
      const e = await loadExecution(c, id);
      await assertOpenPeriod(c, e.fecha_texto);
      await c.query(
        'UPDATE gestion.ruta_ejecucion SET anulada=true,motivo_anulacion=$2 WHERE id=$1',
        [e.id, d.motivo],
      );
      await audit(
        c,
        user,
        null,
        'ruta.anulada',
        { id: e.id, estado: e.estado },
        { motivo: d.motivo },
      );
    });
    res.status(204).end();
  });

  // ---------------------------------------------------------------- supervisor: el día de la operación
  router.get('/operacion/dia', async (req, res) => {
    const q = z.object({ fecha: day.optional() }).strict().parse(req.query);
    const today = limaToday();
    const fecha = q.fecha ?? today;
    const nowMinutes = limaMinutes();
    const [programs, weekRows, pendingTickets, missed, visits, suspended] = await Promise.all([
      pool.query(
        `SELECT p.id,p.ruta_codigo AS ruta,r.nombre AS "rutaNombre",r.color,p.servicio,p.nombre,
                to_char(p.hora_inicio,'HH24:MI') AS "horaInicio",to_char(p.hora_fin,'HH24:MI') AS "horaFin",
                p.vehiculo,p.operador,p.sectores,
                (SELECT count(*)::int FROM bagua_master.ruta_punto_control pc WHERE pc.programacion_id=p.id) AS puntos,
                e.id AS "ejecucionId",e.estado,e.motivo_interrupcion AS "motivoInterrupcion",u.nombre AS conductor,
                s.momento AS salida,
                round(extract(epoch FROM (s.momento AT TIME ZONE 'America/Lima')::time - p.hora_inicio)/60)::int AS "atrasoSalida",
                lp.orden AS "ultimoOrden",lp.nombre AS "ultimoPunto",lp.momento AS "ultimoMomento",lp.atraso AS "ultimoAtraso",
                (SELECT count(DISTINCT x.punto_id)::int FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='paso') AS pasados,
                (SELECT count(*)::int FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='llegada') AS llegadas,
                (SELECT max(x.momento) FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='llegada') AS llegada,
                (SELECT count(*)::int FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado) AS tickets,
                (SELECT coalesce(sum(w.peso_neto_kg),0)::float8 FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado) AS "netoKg",
                ST_X(le.geom) AS lon,ST_Y(le.geom) AS lat
         FROM bagua_master.ruta_programacion p
         JOIN bagua_master.ruta r ON r.codigo=p.ruta_codigo
         LEFT JOIN gestion.ruta_ejecucion e ON e.programacion_id=p.id AND e.fecha=$1 AND NOT e.anulada
         LEFT JOIN gestion.usuario u ON u.id=e.conductor_id
         LEFT JOIN LATERAL (SELECT x.momento FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='salida'
                            ORDER BY x.momento LIMIT 1) s ON true
         LEFT JOIN LATERAL (
           SELECT pc.orden,pc.nombre,x.momento,
                  round(extract(epoch FROM (x.momento AT TIME ZONE 'America/Lima')::time - pc.hora_programada)/60)::int AS atraso
           FROM gestion.ruta_evento x JOIN bagua_master.ruta_punto_control pc ON pc.id=x.punto_id
           WHERE x.ejecucion_id=e.id AND x.tipo='paso' ORDER BY x.momento DESC LIMIT 1) lp ON true
         LEFT JOIN LATERAL (SELECT x.geom FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.geom IS NOT NULL
                            ORDER BY x.momento DESC LIMIT 1) le ON true
         WHERE p.vigente AND extract(isodow FROM $1::date)::smallint = ANY(p.dias)
         ORDER BY p.hora_inicio,p.id`,
        [fecha],
      ),
      pool.query(
        `WITH d AS (SELECT generate_series($1::date-6,$1::date,'1 day')::date AS fecha),
         prog AS (
           SELECT d.fecha,p.id FROM d JOIN bagua_master.ruta_programacion p
             ON p.vigente AND extract(isodow FROM d.fecha)::smallint = ANY(p.dias)
           WHERE NOT EXISTS (SELECT 1 FROM bagua_master.aviso_servicio a
                             WHERE a.tipo='suspension' AND NOT a.retirado AND d.fecha BETWEEN a.desde AND a.hasta
                               AND (cardinality(a.programaciones)=0 OR p.id=ANY(a.programaciones)))),
         ex AS (
           SELECT e.fecha,e.id,e.estado FROM gestion.ruta_ejecucion e
           WHERE NOT e.anulada AND e.fecha BETWEEN $1::date-6 AND $1::date),
         pasos AS (
           SELECT e.fecha,count(*) AS total,
                  count(*) FILTER (WHERE abs(extract(epoch FROM (x.momento AT TIME ZONE 'America/Lima')::time - pc.hora_programada)) <= 900) AS puntuales
           FROM ex e JOIN gestion.ruta_evento x ON x.ejecucion_id=e.id AND x.tipo='paso'
           JOIN bagua_master.ruta_punto_control pc ON pc.id=x.punto_id GROUP BY 1),
         peso AS (
           SELECT w.fecha,sum(w.peso_neto_kg) AS kg FROM gestion.pesaje w
           WHERE NOT w.anulado AND w.destino='relleno' AND w.fecha BETWEEN $1::date-6 AND $1::date GROUP BY 1)
         SELECT d.fecha::text,
                (SELECT count(*)::int FROM prog WHERE prog.fecha=d.fecha) AS programadas,
                (SELECT count(*)::int FROM ex WHERE ex.fecha=d.fecha) AS ejecutadas,
                (SELECT count(*)::int FROM ex WHERE ex.fecha=d.fecha AND ex.estado='completada') AS completadas,
                coalesce(pasos.total,0)::int AS pasos,coalesce(pasos.puntuales,0)::int AS puntuales,
                coalesce(peso.kg,0)::float8 AS kg
         FROM d LEFT JOIN pasos USING (fecha) LEFT JOIN peso USING (fecha) ORDER BY d.fecha`,
        [fecha],
      ),
      pool.query(
        `SELECT e.id,e.fecha::text,g.nombre,e.vehiculo,
                count(x.id)::int AS llegadas,
                (SELECT count(*)::int FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado) AS tickets
         FROM gestion.ruta_ejecucion e
         JOIN gestion.ruta_evento x ON x.ejecucion_id=e.id AND x.tipo='llegada' AND x.destino='relleno'
         LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
         WHERE NOT e.anulada AND e.fecha BETWEEN $1::date-7 AND $1::date
         GROUP BY e.id,g.nombre
         HAVING count(x.id) > (SELECT count(*) FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado)
         ORDER BY e.fecha,g.nombre`,
        [fecha],
      ),
      pool.query(
        `WITH d AS (SELECT generate_series($1::date-7,$1::date-1,'1 day')::date AS fecha)
         SELECT d.fecha::text,p.id,p.nombre FROM d
         JOIN bagua_master.ruta_programacion p ON p.vigente AND extract(isodow FROM d.fecha)::smallint = ANY(p.dias)
         WHERE d.fecha >= (SELECT min(e.fecha) FROM gestion.ruta_ejecucion e WHERE e.programacion_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM gestion.ruta_ejecucion e WHERE e.programacion_id=p.id AND e.fecha=d.fecha AND NOT e.anulada)
           AND NOT EXISTS (SELECT 1 FROM bagua_master.aviso_servicio a
                           WHERE a.tipo='suspension' AND NOT a.retirado AND d.fecha BETWEEN a.desde AND a.hasta
                             AND (cardinality(a.programaciones)=0 OR p.id=ANY(a.programaciones)))
         ORDER BY d.fecha,p.hora_inicio`,
        [fecha],
      ),
      pool.query(
        `SELECT s.codigo,s.nombre,count(*)::int AS visitas,
                count(*) FILTER (WHERE v.resultado='entrego')::int AS "conEntrega",
                count(DISTINCT v.responsable_id)::int AS promotores
         FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
         JOIN gestion.servicio s ON s.id=a.servicio_id
         WHERE NOT v.anulada AND v.fecha=$1 GROUP BY s.codigo,s.nombre ORDER BY s.nombre`,
        [fecha],
      ),
      pool.query(
        `SELECT id,tipo,titulo,programaciones FROM bagua_master.aviso_servicio
         WHERE NOT retirado AND $1::date BETWEEN desde AND hasta ORDER BY desde`,
        [fecha],
      ),
    ]);
    const suspensions = suspended.rows.filter((a) => a.tipo === 'suspension');
    const isSuspended = (id: string) =>
      suspensions.some((a) => !a.programaciones.length || a.programaciones.includes(id));
    const rutas = programs.rows.map((p) => ({
      ...p,
      situacion: programStatus(fecha, today, nowMinutes, p.horaInicio, p.estado, isSuspended(p.id)),
    }));
    const alertas = [
      ...rutas
        .filter((r) => r.situacion === 'sin_iniciar')
        .map((r) => ({
          tipo: 'sin_iniciar',
          nivel: 'alta',
          texto: `${shortName(r.nombre)}: sin salida registrada (debía empezar a las ${r.horaInicio}).`,
          programacionId: r.id,
        })),
      ...rutas
        .filter((r) => r.situacion === 'interrumpida')
        .map((r) => ({
          tipo: 'interrumpida',
          nivel: 'alta',
          texto: `${shortName(r.nombre)}: interrumpida · ${r.motivoInterrupcion ?? 'sin motivo'}.`,
          ejecucionId: r.ejecucionId,
        })),
      ...rutas
        .filter((r) => r.situacion === 'en_curso' && (r.ultimoAtraso ?? r.atrasoSalida ?? 0) > 30)
        .map((r) => ({
          tipo: 'atraso',
          nivel: 'media',
          texto: `${shortName(r.nombre)}: ${r.ultimoAtraso ?? r.atrasoSalida} min de atraso${r.ultimoPunto ? ` en ${r.ultimoPunto}` : ''}.`,
          ejecucionId: r.ejecucionId,
        })),
      ...missed.rows.map((m) => ({
        tipo: 'no_ejecutada',
        nivel: 'media',
        texto: `${shortName(m.nombre)}: no salió el ${dayText(m.fecha)}.`,
        programacionId: m.id,
        fecha: m.fecha,
      })),
      ...pendingTickets.rows.map((t) => ({
        tipo: 'ticket',
        nivel: 'baja',
        texto: `${t.nombre ? shortName(t.nombre) : t.vehiculo} (${dayText(t.fecha)}): ${t.llegadas - t.tickets} ticket(s) de balanza por registrar.`,
        ejecucionId: t.id,
        fecha: t.fecha,
      })),
    ];
    res.json({
      fecha,
      hoy: today,
      ahora: nowMinutes,
      rutas,
      alertas,
      semana: weekRows.rows,
      visitas: visits.rows,
      avisos: suspended.rows,
    });
  });

  router.get('/operacion/ejecuciones', async (req, res) => {
    const q = z
      .object({
        desde: day.optional(),
        hasta: day.optional(),
        programacion: z.string().max(40).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(req.query);
    const hasta = q.hasta ?? limaToday();
    const desde = q.desde ?? shiftDay(hasta, -30);
    const rows = (
      await pool.query(
        `SELECT e.id,e.fecha::text,e.programacion_id AS "programacionId",g.nombre,e.servicio,e.vehiculo,e.estado,
                u.nombre AS conductor,
                (SELECT min(x.momento) FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='salida') AS salida,
                (SELECT max(x.momento) FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='llegada') AS llegada,
                (SELECT count(*)::int FROM gestion.ruta_evento x WHERE x.ejecucion_id=e.id AND x.tipo='paso') AS pasos,
                (SELECT count(*)::int FROM bagua_master.ruta_punto_control pc WHERE pc.programacion_id=e.programacion_id) AS puntos,
                (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (x.momento AT TIME ZONE 'America/Lima')::time - pc.hora_programada)/60))::int
                   FROM gestion.ruta_evento x JOIN bagua_master.ruta_punto_control pc ON pc.id=x.punto_id
                  WHERE x.ejecucion_id=e.id AND x.tipo='paso') AS "atrasoMediano",
                (SELECT coalesce(sum(w.peso_neto_kg),0)::float8 FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado) AS "netoKg"
         FROM gestion.ruta_ejecucion e
         LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
         JOIN gestion.usuario u ON u.id=e.conductor_id
         WHERE NOT e.anulada AND e.fecha BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR e.programacion_id=$3)
         ORDER BY e.fecha DESC,salida DESC LIMIT 51 OFFSET $4`,
        [desde, hasta, q.programacion ?? null, (q.page - 1) * 50],
      )
    ).rows;
    res.json({ desde, hasta, items: rows.slice(0, 50), siguiente: rows.length > 50 });
  });

  router.get('/operacion/ejecuciones/:id', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const e = (
      await pool.query(
        `SELECT e.id,e.fecha::text,e.programacion_id AS "programacionId",g.nombre,g.ruta_codigo AS ruta,r.color,
                e.servicio,e.vehiculo,e.estado,e.motivo_interrupcion AS "motivoInterrupcion",u.nombre AS conductor,
                to_char(g.hora_inicio,'HH24:MI') AS "horaInicio",to_char(g.hora_fin,'HH24:MI') AS "horaFin"
         FROM gestion.ruta_ejecucion e
         LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
         LEFT JOIN bagua_master.ruta r ON r.codigo=e.ruta_codigo
         JOIN gestion.usuario u ON u.id=e.conductor_id WHERE e.id=$1 AND NOT e.anulada`,
        [id],
      )
    ).rows[0];
    if (!e) throw new AppError(404, 'NOT_FOUND', 'Ejecución no encontrada.');
    const [points, events, weighings] = await Promise.all([
      pool.query(
        `SELECT pc.id,pc.orden,pc.nombre,to_char(pc.hora_programada,'HH24:MI') AS hora,pc.base,
                ST_X(pc.geom) AS lon,ST_Y(pc.geom) AS lat,x.momento,
                round(extract(epoch FROM (x.momento AT TIME ZONE 'America/Lima')::time - pc.hora_programada)/60)::int AS atraso,
                round(ST_Distance(x.geom::geography,pc.geom::geography))::int AS "distanciaM"
         FROM bagua_master.ruta_punto_control pc
         LEFT JOIN gestion.ruta_evento x ON x.punto_id=pc.id AND x.ejecucion_id=$2 AND x.tipo='paso'
         WHERE pc.programacion_id=$1 ORDER BY pc.orden`,
        [e.programacionId, id],
      ),
      pool.query(
        `SELECT x.id,x.tipo,x.momento,x.punto_id AS "puntoId",x.destino,x.nota,x.precision_m AS precision,
                ST_X(x.geom) AS lon,ST_Y(x.geom) AS lat,x.registrado_en AS "registradoEn"
         FROM gestion.ruta_evento x WHERE x.ejecucion_id=$1 ORDER BY x.momento`,
        [id],
      ),
      pool.query(
        `SELECT w.id,w.ticket,w.fecha::text,to_char(w.hora,'HH24:MI') AS hora,w.vehiculo,w.destino,
                w.peso_bruto_kg::float8 AS "pesoBrutoKg",w.tara_kg::float8 AS "taraKg",w.peso_neto_kg::float8 AS "pesoNetoKg"
         FROM gestion.pesaje w WHERE w.ejecucion_id=$1 AND NOT w.anulado ORDER BY w.hora NULLS LAST`,
        [id],
      ),
    ]);
    res.json({ ...e, puntos: points.rows, eventos: events.rows, pesajes: weighings.rows });
  });

  router.get('/operacion/cumplimiento', async (req, res) => {
    const q = z.object({ desde: day.optional(), hasta: day.optional() }).strict().parse(req.query);
    const hasta = q.hasta ?? limaToday();
    const desde = q.desde ?? shiftDay(hasta, -29);
    res.json({ desde, hasta, programas: (await compliance(pool, desde, hasta)).rows });
  });

  // ---------------------------------------------------------------- pesaje en la oficina
  router.get('/vehiculos', async (_req, res) => {
    res.json({
      items: (
        await pool.query(
          `SELECT placa,descripcion,tipo,capacidad_m3::float8 AS "capacidadM3",tara_kg::float8 AS "taraKg",anio,activo
           FROM gestion.vehiculo ORDER BY activo DESC,tipo,placa`,
        )
      ).rows,
    });
  });

  router.get('/pesajes', async (req, res) => {
    const q = z.object({ desde: day.optional(), hasta: day.optional() }).strict().parse(req.query);
    const hasta = q.hasta ?? limaToday();
    const desde = q.desde ?? shiftDay(hasta, -14);
    const [items, pending] = await Promise.all([
      pool.query(
        `SELECT w.id,w.ticket,w.fecha::text,to_char(w.hora,'HH24:MI') AS hora,w.vehiculo,w.destino,
                w.peso_bruto_kg::float8 AS "pesoBrutoKg",w.tara_kg::float8 AS "taraKg",w.peso_neto_kg::float8 AS "pesoNetoKg",
                w.observaciones,w.ejecucion_id AS "ejecucionId",g.nombre AS ruta,u.nombre AS "registradoPor"
         FROM gestion.pesaje w
         LEFT JOIN gestion.ruta_ejecucion e ON e.id=w.ejecucion_id
         LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
         JOIN gestion.usuario u ON u.id=w.registrado_por
         WHERE NOT w.anulado AND w.fecha BETWEEN $1::date AND $2::date
         ORDER BY w.fecha DESC,w.hora DESC NULLS LAST LIMIT 300`,
        [desde, hasta],
      ),
      pool.query(
        `SELECT e.id AS "ejecucionId",e.fecha::text,g.nombre AS ruta,e.vehiculo,
                (SELECT v.placa FROM gestion.vehiculo v WHERE e.vehiculo ILIKE '%'||v.placa||'%' LIMIT 1) AS placa,
                count(x.id)::int AS llegadas,
                (SELECT count(*)::int FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado) AS tickets,
                to_char(max(x.momento) AT TIME ZONE 'America/Lima','HH24:MI') AS "ultimaLlegada"
         FROM gestion.ruta_ejecucion e
         JOIN gestion.ruta_evento x ON x.ejecucion_id=e.id AND x.tipo='llegada' AND x.destino='relleno'
         LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
         WHERE NOT e.anulada AND e.fecha BETWEEN $1::date AND $2::date
         GROUP BY e.id,g.nombre
         HAVING count(x.id) > (SELECT count(*) FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado)
         ORDER BY e.fecha DESC,g.nombre`,
        [desde, hasta],
      ),
    ]);
    res.json({ desde, hasta, items: items.rows, pendientes: pending.rows });
  });

  router.post('/pesajes', auth.write, async (req, res) => {
    const d = weighingInput.parse(req.body);
    const user = res.locals.user as User;
    if (d.fecha > limaToday())
      throw new AppError(400, 'INVALID_DATE', 'No se registran tickets con fecha futura.');
    const row = await transaction(pool, async (c) => {
      await assertOpenPeriod(c, d.fecha);
      if (d.ejecucionId) {
        const e = (
          await c.query(
            'SELECT id,fecha::text FROM gestion.ruta_ejecucion WHERE id=$1 AND NOT anulada',
            [d.ejecucionId],
          )
        ).rows[0];
        if (!e) throw new AppError(404, 'NOT_FOUND', 'La ruta indicada no existe.');
        if (e.fecha > d.fecha)
          throw new AppError(400, 'INVALID_DATE', 'El ticket no puede ser anterior a la ruta.');
      }
      const dup = (
        await c.query(
          'SELECT 1 FROM gestion.pesaje WHERE destino=$1 AND ticket=$2 AND NOT anulado',
          [d.destino, d.ticket],
        )
      ).rowCount;
      if (dup) throw new AppError(409, 'DUPLICATE', `El ticket ${d.ticket} ya está registrado.`);
      const created = (
        await c.query(
          `INSERT INTO gestion.pesaje(ejecucion_id,destino,fecha,hora,ticket,vehiculo,peso_bruto_kg,tara_kg,observaciones,registrado_por)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,ticket,peso_neto_kg::float8 AS "pesoNetoKg"`,
          [
            d.ejecucionId,
            d.destino,
            d.fecha,
            d.hora,
            d.ticket,
            d.vehiculo,
            d.pesoBrutoKg,
            d.taraKg,
            d.observaciones,
            user.id,
          ],
        )
      ).rows[0];
      await audit(c, user, null, 'pesaje.registrado', null, { ...created, ...d });
      return created;
    });
    res.status(201).json(row);
  });

  router.post('/pesajes/:id/anular', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const d = z
      .object({ motivo: z.string().trim().min(5).max(300) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const before = (
        await c.query('SELECT *,fecha::text AS f FROM gestion.pesaje WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!before || before.anulado)
        throw new AppError(404, 'NOT_FOUND', 'Ticket no encontrado o ya anulado.');
      await assertOpenPeriod(c, before.f);
      await c.query('UPDATE gestion.pesaje SET anulado=true,motivo_anulacion=$2 WHERE id=$1', [
        id,
        d.motivo,
      ]);
      await audit(c, user, null, 'pesaje.anulado', before, { motivo: d.motivo });
    });
    res.status(204).end();
  });

  return router;
}

/** Cumplimiento por programación en un periodo: programadas, ejecutadas, puntualidad y toneladas. */
export function compliance(pool: Pool | PoolClient, desde: string, hasta: string) {
  return pool.query(
    `WITH d AS (SELECT generate_series($1::date,$2::date,'1 day')::date AS fecha),
     prog AS (
       SELECT d.fecha,p.id FROM d JOIN bagua_master.ruta_programacion p
         ON p.vigente AND extract(isodow FROM d.fecha)::smallint = ANY(p.dias)
       WHERE d.fecha >= coalesce((SELECT min(e.fecha) FROM gestion.ruta_ejecucion e WHERE e.programacion_id=p.id), $2::date + 1)
         AND NOT EXISTS (SELECT 1 FROM bagua_master.aviso_servicio a
                         WHERE a.tipo='suspension' AND NOT a.retirado AND d.fecha BETWEEN a.desde AND a.hasta
                           AND (cardinality(a.programaciones)=0 OR p.id=ANY(a.programaciones))))
     SELECT p.id,p.nombre,p.servicio,r.color,
            (SELECT count(*)::int FROM prog WHERE prog.id=p.id) AS programadas,
            count(e.id)::int AS ejecutadas,
            count(e.id) FILTER (WHERE e.estado='completada')::int AS completadas,
            count(e.id) FILTER (WHERE e.estado='interrumpida')::int AS interrumpidas,
            (SELECT count(*)::int FROM gestion.ruta_evento x JOIN gestion.ruta_ejecucion y ON y.id=x.ejecucion_id
               WHERE y.programacion_id=p.id AND NOT y.anulada AND x.tipo='paso' AND y.fecha BETWEEN $1::date AND $2::date) AS pasos,
            (SELECT count(*)::int FROM gestion.ruta_evento x JOIN gestion.ruta_ejecucion y ON y.id=x.ejecucion_id
               JOIN bagua_master.ruta_punto_control pc ON pc.id=x.punto_id
               WHERE y.programacion_id=p.id AND NOT y.anulada AND x.tipo='paso' AND y.fecha BETWEEN $1::date AND $2::date
                 AND abs(extract(epoch FROM (x.momento AT TIME ZONE 'America/Lima')::time - pc.hora_programada)) <= 900) AS puntuales,
            (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (x.momento AT TIME ZONE 'America/Lima')::time - pc.hora_programada)/60))::int
               FROM gestion.ruta_evento x JOIN gestion.ruta_ejecucion y ON y.id=x.ejecucion_id
               JOIN bagua_master.ruta_punto_control pc ON pc.id=x.punto_id
              WHERE y.programacion_id=p.id AND NOT y.anulada AND x.tipo='paso' AND y.fecha BETWEEN $1::date AND $2::date) AS "atrasoMediano",
            (SELECT count(*)::int FROM gestion.pesaje w JOIN gestion.ruta_ejecucion y ON y.id=w.ejecucion_id
               WHERE y.programacion_id=p.id AND NOT w.anulado AND NOT y.anulada AND y.fecha BETWEEN $1::date AND $2::date) AS viajes,
            (SELECT coalesce(sum(w.peso_neto_kg),0)::float8 FROM gestion.pesaje w JOIN gestion.ruta_ejecucion y ON y.id=w.ejecucion_id
               WHERE y.programacion_id=p.id AND NOT w.anulado AND NOT y.anulada AND y.fecha BETWEEN $1::date AND $2::date) AS kg
     FROM bagua_master.ruta_programacion p
     JOIN bagua_master.ruta r ON r.codigo=p.ruta_codigo
     LEFT JOIN gestion.ruta_ejecucion e ON e.programacion_id=p.id AND NOT e.anulada AND e.fecha BETWEEN $1::date AND $2::date
     WHERE p.vigente GROUP BY p.id,r.color ORDER BY p.hora_inicio,p.id`,
    [desde, hasta],
  );
}
