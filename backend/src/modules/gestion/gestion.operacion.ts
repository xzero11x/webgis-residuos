import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import { assertOpenPeriod } from './gestion.periodo.js';
import type { User } from './gestion.schema.js';

// Operación del servicio de residuos: horario de recolección de un predio, recorrido de campo del
// día, visitas (entregó / no entregó / ausente) con sus entregas, resultados, padrón en el formato
// oficial del MINAM (anexos 03-A a 03-D) y valorización mensual por actor. Todo bajo las mismas
// reglas que el resto de /api/gestion: sesión, permisos y destino de fixtures en las escrituras.

/** Servicios selectivos del catálogo por tipo (convención de códigos del catálogo de demostración). */
export const SELECTIVE = {
  organicos: {
    codes: ['SIM-ORGANICOS'],
    programa: 'organicos',
    annex: { domiciliario: '03-C', no_domiciliario: '03-D' },
  },
  reciclables: {
    codes: ['SIM-RECICLABLES'],
    programa: 'reciclables',
    annex: { domiciliario: '03-A', no_domiciliario: '03-B' },
  },
} as const;
const tipo = z.enum(['organicos', 'reciclables']);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

export const visitInput = z
  .object({
    clave: z.uuid(),
    participacionId: z.uuid(),
    fecha: day,
    resultado: z.enum(['entrego', 'no_entrego', 'ausente']),
    origen: z.enum(['lista', 'qr', 'codigo']).default('lista'),
    observaciones: z.string().trim().max(500).default(''),
    entregas: z
      .array(
        z
          .object({
            material: z.string().trim().min(2).max(80),
            cantidad: z.number().positive().max(2000).nullable(),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict()
  .refine((v) => (v.resultado === 'entrego') === v.entregas.length > 0, {
    message: 'Una entrega necesita al menos un material; sin entrega no se registran materiales.',
    path: ['entregas'],
  })
  .refine((v) => new Set(v.entregas.map((e) => e.material)).size === v.entregas.length, {
    message: 'Cada material va una sola vez por visita.',
    path: ['entregas'],
  });

export const valorizationInput = z
  .object({
    actorId: z.uuid(),
    fecha: day,
    material: z.string().trim().min(2).max(80),
    toneladas: z.number().positive().max(500),
    comprobanteTipo: z.enum(['boleta', 'factura', 'liquidacion_compra', 'registro_planta']),
    comprobanteNumero: z.string().trim().min(3).max(40),
    observaciones: z.string().trim().max(300).default(''),
  })
  .strict();

const period = z
  .object({ desde: day.optional(), hasta: day.optional() })
  .strict()
  .transform((p) => {
    const hasta = p.hasta ?? limaToday();
    const d = new Date(`${hasta}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 6);
    return { desde: p.desde ?? d.toISOString().slice(0, 10), hasta };
  });

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  // Evita fórmulas al abrir en una hoja de cálculo.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function createOperationRouter(
  pool: Pool,
  auth: { write: RequestHandler; privateData: RequestHandler },
) {
  const router = Router();

  // ---------------------------------------------------------------- predio: horario y participación
  router.get('/predios/:id/operacion', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const user = res.locals.user as User;
    const found = (
      await pool.query(
        `SELECT p.id,
           coalesce(ST_SetSRID(ST_GeomFromGeoJSON(p.ubicacion::text),4326),
             (SELECT ST_PointOnSurface(e.geom) FROM gestion.vinculo_espacial v
                JOIN bagua_master.edificio e ON e.id=v.edificio_id
               WHERE v.predio_id=p.id AND v.estado='confirmado' LIMIT 1)) AS punto
         FROM gestion.predio p WHERE p.id=$1`,
        [id],
      )
    ).rows[0];
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Predio no encontrado.');
    const schedule = found.punto
      ? (
          await pool.query(
            `SELECT x.programacion_id AS id,x.ruta_codigo AS ruta,x.ruta_nombre AS "rutaNombre",x.color,x.servicio,x.nombre,x.dias,
                    to_char(x.hora_inicio,'HH24:MI') AS "horaInicio",to_char(x.hora_fin,'HH24:MI') AS "horaFin",x.turno,
                    x.operador,to_char(x.hora_estimada,'HH24:MI') AS "horaEstimada",x.base,
                    CASE WHEN a.recorridos >= 3 THEN to_char(('2000-01-01'::timestamp + make_interval(secs =>
                      round(extract(epoch FROM x.hora_estimada + make_interval(mins => a.minutos)) / 300) * 300))::time,'HH24:MI') END AS "horaHabitual",
                    coalesce(a.recorridos,0) AS recorridos,
                    (SELECT coalesce(json_agg(json_build_object('id',v.id,'tipo',v.tipo,'titulo',v.titulo,'mensaje',v.mensaje,
                        'desde',v.desde,'hasta',v.hasta) ORDER BY v.desde),'[]')
                       FROM bagua_master.aviso_servicio v
                      WHERE NOT v.retirado AND v.hasta >= (now() AT TIME ZONE 'America/Lima')::date
                        AND v.desde <= (now() AT TIME ZONE 'America/Lima')::date + 14
                        AND (cardinality(v.programaciones)=0 OR x.programacion_id=ANY(v.programaciones))) AS avisos
             FROM bagua_master.recoleccion_en_punto($1) x
             LEFT JOIN LATERAL bagua_master.atraso_habitual(x.programacion_id, $1) a ON true
             ORDER BY x.servicio,x.hora_estimada`,
            [found.punto],
          )
        ).rows
      : [];
    const participations = (
      await pool.query(
        `SELECT a.id,s.codigo AS "servicioCodigo",s.nombre AS servicio,a.desde::text,a.hasta::text,
                a.tipo_generador AS "tipoGenerador",a.habitantes,a.establecimiento,
                a.tipo_establecimiento AS "tipoEstablecimiento",a.codigo_padron AS "codigoPadron",a.zona,
                CASE WHEN $2 THEN r.nombre END AS representante,
                count(v.id) FILTER (WHERE NOT v.anulada)::int AS visitas,
                count(v.id) FILTER (WHERE NOT v.anulada AND v.resultado='entrego')::int AS entregas,
                max(v.fecha) FILTER (WHERE NOT v.anulada)::text AS "ultimaVisita",
                (SELECT coalesce(sum(e.cantidad),0)::float8 FROM gestion.entrega e
                  WHERE e.participacion_id=a.id AND NOT e.anulada AND e.unidad='kg') AS kg,
                (SELECT coalesce(json_agg(x ORDER BY x.fecha DESC),'[]') FROM (
                   SELECT v2.id,v2.fecha::text,v2.resultado,v2.observaciones,
                     (SELECT coalesce(sum(e.cantidad),0)::float8 FROM gestion.entrega e WHERE e.visita_id=v2.id AND NOT e.anulada) AS kg,
                     (SELECT coalesce(json_agg(e.material ORDER BY e.material),'[]') FROM gestion.entrega e WHERE e.visita_id=v2.id AND NOT e.anulada) AS materiales
                   FROM gestion.visita v2 WHERE v2.participacion_id=a.id AND NOT v2.anulada
                   ORDER BY v2.fecha DESC LIMIT 16) x) AS recientes
         FROM gestion.participacion a
         JOIN gestion.servicio s ON s.id=a.servicio_id
         LEFT JOIN gestion.persona r ON r.id=a.representante_id
         LEFT JOIN gestion.visita v ON v.participacion_id=a.id
         WHERE a.predio_id=$1
         GROUP BY a.id,s.codigo,s.nombre,r.nombre
         ORDER BY a.hasta IS NOT NULL,a.desde DESC`,
        [id, user.rol !== 'consulta'],
      )
    ).rows;
    res.json({ horarios: schedule, participaciones: participations });
  });

  // ---------------------------------------------------------------- campo: recorrido del día
  router.get('/campo', auth.privateData, async (req, res) => {
    const q = z
      .object({ servicio: tipo, fecha: day.optional(), ruta: z.string().max(40).optional() })
      .strict()
      .parse(req.query);
    const fecha = q.fecha ?? limaToday();
    const programs = (
      await pool.query(
        `SELECT g.id,g.ruta_codigo AS ruta,r.nombre AS "rutaNombre",r.color,g.nombre,
                to_char(g.hora_inicio,'HH24:MI') AS "horaInicio",to_char(g.hora_fin,'HH24:MI') AS "horaFin",g.operador
         FROM bagua_master.ruta_programacion g JOIN bagua_master.ruta r ON r.codigo=g.ruta_codigo
         WHERE g.vigente AND g.servicio=$1 AND extract(isodow FROM $2::date)::smallint = ANY(g.dias)
           AND ($3::text IS NULL OR g.ruta_codigo=$3)
         ORDER BY g.hora_inicio`,
        [q.servicio, fecha, q.ruta ?? null],
      )
    ).rows;
    if (!programs.length) return res.json({ fecha, programas: [], participantes: [] });
    const rows = (
      await pool.query(
        `SELECT a.id AS "participacionId",a.codigo_padron AS "codigoPadron",a.tipo_generador AS "tipoGenerador",
                a.establecimiento,p.id AS "predioId",p.codigo AS "predioCodigo",p.direccion,p.sector,
                r.nombre AS representante,h.programacion_id AS programa,h.ruta_codigo AS ruta,
                to_char(h.hora_estimada,'HH24:MI') AS "horaEstimada",
                v.id AS "visitaId",v.resultado,
                (SELECT coalesce(json_agg(json_build_object('material',e.material,'cantidad',e.cantidad) ORDER BY e.material),'[]')
                   FROM gestion.entrega e WHERE e.visita_id=v.id AND NOT e.anulada) AS entregas,
                (SELECT coalesce(json_agg(x.resultado ORDER BY x.fecha DESC),'[]') FROM (
                   SELECT v3.resultado,v3.fecha FROM gestion.visita v3
                   WHERE v3.participacion_id=a.id AND NOT v3.anulada AND v3.fecha<$2::date
                   ORDER BY v3.fecha DESC LIMIT 6) x) AS historial
         FROM gestion.participacion a
         JOIN gestion.servicio s ON s.id=a.servicio_id
         JOIN gestion.predio p ON p.id=a.predio_id AND NOT p.archivado AND p.ubicacion IS NOT NULL
         LEFT JOIN gestion.persona r ON r.id=a.representante_id
         CROSS JOIN LATERAL (
           SELECT x.* FROM bagua_master.recoleccion_en_punto(ST_SetSRID(ST_GeomFromGeoJSON(p.ubicacion::text),4326)) x
           WHERE x.programacion_id = ANY($3::text[]) ORDER BY x.distancia_m LIMIT 1
         ) h
         LEFT JOIN gestion.visita v ON v.participacion_id=a.id AND v.fecha=$2::date AND NOT v.anulada
         WHERE s.codigo = ANY($1::text[]) AND a.desde<=$2::date AND (a.hasta IS NULL OR a.hasta>=$2::date)
         ORDER BY h.hora_estimada,p.direccion`,
        [SELECTIVE[q.servicio].codes, fecha, programs.map((p) => p.id)],
      )
    ).rows;
    res.json({ fecha, programas: programs, participantes: rows });
  });

  router.get('/materiales-activos', async (_req, res) => {
    res.json({
      items: (
        await pool.query('SELECT codigo,nombre FROM gestion.material WHERE activo ORDER BY nombre')
      ).rows,
    });
  });

  router.post('/visitas', auth.write, async (req, res) => {
    const d = visitInput.parse(req.body);
    const user = res.locals.user as User;
    if (d.fecha > limaToday())
      throw new AppError(400, 'INVALID_DATE', 'No se registran visitas en fechas futuras.');
    const existing = (await pool.query('SELECT id FROM gestion.visita WHERE clave=$1', [d.clave]))
      .rows[0];
    if (existing) return res.status(200).json({ id: existing.id, repetida: true });
    const created = await transaction(pool, async (c) => {
      await assertOpenPeriod(c, d.fecha);
      const part = (
        await c.query(
          `SELECT a.id,a.predio_id,a.desde::text,a.hasta::text,p.archivado FROM gestion.participacion a
           JOIN gestion.predio p ON p.id=a.predio_id WHERE a.id=$1 FOR SHARE OF a`,
          [d.participacionId],
        )
      ).rows[0];
      if (!part) throw new AppError(404, 'NOT_FOUND', 'Participante no encontrado.');
      if (part.archivado) throw new AppError(409, 'ARCHIVED', 'El predio está archivado.');
      if (d.fecha < part.desde || (part.hasta && d.fecha > part.hasta))
        throw new AppError(
          400,
          'INVALID_DATE',
          'La fecha está fuera del periodo de participación.',
        );
      if (d.entregas.length) {
        const known = (
          await c.query('SELECT nombre FROM gestion.material WHERE activo AND nombre=ANY($1)', [
            d.entregas.map((e) => e.material),
          ])
        ).rows.map((r) => r.nombre as string);
        const unknown = d.entregas.filter((e) => !known.includes(e.material));
        if (unknown.length)
          throw new AppError(
            400,
            'UNKNOWN_MATERIAL',
            `Material no catalogado: ${unknown[0]!.material}.`,
          );
      }
      const already = (
        await c.query(
          'SELECT id FROM gestion.visita WHERE participacion_id=$1 AND fecha=$2 AND NOT anulada',
          [d.participacionId, d.fecha],
        )
      ).rows[0];
      if (already)
        throw new AppError(
          409,
          'DUPLICATE',
          'Ya hay una visita registrada para este participante en esa fecha.',
        );
      const visit = (
        await c.query(
          `INSERT INTO gestion.visita(participacion_id,fecha,resultado,observaciones,responsable_id,clave,origen)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,fecha::text,resultado,origen`,
          [d.participacionId, d.fecha, d.resultado, d.observaciones, user.id, d.clave, d.origen],
        )
      ).rows[0];
      for (const [index, e] of d.entregas.entries()) {
        await c.query(
          `INSERT INTO gestion.entrega(participacion_id,fecha,material,cantidad,unidad,responsable_id,clave,visita_id)
           VALUES($1,$2,$3,$4,$5,$6,gen_random_uuid(),$7)`,
          [
            d.participacionId,
            d.fecha,
            e.material,
            e.cantidad,
            e.cantidad === null ? null : 'kg',
            user.id,
            visit.id,
          ],
        );
        void index;
      }
      await audit(c, user, part.predio_id, 'visita.registrada', null, {
        ...visit,
        entregas: d.entregas,
      });
      return visit;
    });
    res.status(201).json(created);
  });

  router.post('/visitas/:id/anular', auth.write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { motivo } = z
      .object({ motivo: z.string().trim().min(5).max(500) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const current = (await c.query('SELECT fecha::text FROM gestion.visita WHERE id=$1', [id]))
        .rows[0];
      if (current) await assertOpenPeriod(c, current.fecha);
      const visit = (
        await c.query(
          `UPDATE gestion.visita v SET anulada=true,motivo_anulacion=$2 FROM gestion.participacion a
           WHERE v.id=$1 AND NOT v.anulada AND a.id=v.participacion_id RETURNING v.id,v.fecha::text,v.resultado,a.predio_id`,
          [id, motivo],
        )
      ).rows[0];
      if (!visit) throw new AppError(404, 'NOT_FOUND', 'Visita no encontrada o ya anulada.');
      await c.query(
        `UPDATE gestion.entrega SET anulada=true,motivo_anulacion=$2,version=version+1,motivo_cambio=$2,usuario_cambio=$3
         WHERE visita_id=$1 AND NOT anulada`,
        [id, motivo, user.id],
      );
      await audit(c, user, visit.predio_id, 'visita.anulada', visit, { motivo });
    });
    res.status(204).end();
  });

  // ---------------------------------------------------------------- resultados de la operación
  router.get('/resultados/operacion', async (req, res) => {
    const p = period.parse(req.query);
    const args = [p.desde, p.hasta];
    const base = `FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
      JOIN gestion.servicio s ON s.id=a.servicio_id
      WHERE NOT v.anulada AND v.fecha BETWEEN $1::date AND $2::date`;
    const [servicios, meses, sectores, materiales, valorizacion, valorMeses] = await Promise.all([
      pool.query(
        `SELECT s.codigo,s.nombre,
           (SELECT count(*)::int FROM gestion.participacion x WHERE x.servicio_id=s.id AND x.desde<=$2::date AND (x.hasta IS NULL OR x.hasta>=$2::date)) AS inscritos,
           count(*)::int AS visitas, count(*) FILTER (WHERE v.resultado='entrego')::int AS "conEntrega",
           count(*) FILTER (WHERE v.resultado='ausente')::int AS ausentes,
           count(*) FILTER (WHERE v.origen='qr')::int AS "porQr",
           count(DISTINCT a.id) FILTER (WHERE v.resultado='entrego')::int AS "hogaresConEntrega",
           (SELECT coalesce(sum(e.cantidad),0)::float8 FROM gestion.entrega e JOIN gestion.participacion y ON y.id=e.participacion_id
             WHERE y.servicio_id=s.id AND NOT e.anulada AND e.unidad='kg' AND e.fecha BETWEEN $1::date AND $2::date) AS kg
         ${base} GROUP BY s.id ORDER BY s.nombre`,
        args,
      ),
      pool.query(
        `WITH vis AS (
           SELECT date_trunc('month',v.fecha) AS m,s.id AS sid,s.codigo,count(*) AS visitas,
                  count(*) FILTER (WHERE v.resultado='entrego') AS con
           ${base} GROUP BY 1,2,3),
         kg AS (
           SELECT date_trunc('month',e.fecha) AS m,y.servicio_id AS sid,sum(e.cantidad) AS kg
           FROM gestion.entrega e JOIN gestion.participacion y ON y.id=e.participacion_id
           WHERE NOT e.anulada AND e.unidad='kg' AND e.fecha BETWEEN $1::date AND $2::date GROUP BY 1,2)
         SELECT to_char(vis.m,'YYYY-MM') AS mes,vis.codigo,vis.visitas::int,vis.con::int AS "conEntrega",
                coalesce(kg.kg,0)::float8 AS kg
         FROM vis LEFT JOIN kg USING (m,sid) ORDER BY 1,2`,
        args,
      ),
      pool.query(
        `SELECT coalesce(a.zona,'Sin sector') AS sector,s.codigo,count(DISTINCT a.id)::int AS participantes,count(*)::int AS visitas,
           count(*) FILTER (WHERE v.resultado='entrego')::int AS "conEntrega"
         ${base} GROUP BY 1,s.codigo ORDER BY 1,2`,
        args,
      ),
      pool.query(
        `SELECT e.material,count(*)::int AS entregas,count(e.cantidad)::int AS medidas,coalesce(sum(e.cantidad),0)::float8 AS kg
         FROM gestion.entrega e WHERE NOT e.anulada AND e.visita_id IS NOT NULL AND e.fecha BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY kg DESC`,
        args,
      ),
      pool.query(
        `SELECT t.nombre AS actor,t.tipo,v.material,sum(v.toneladas)::float8 AS toneladas,count(*)::int AS comprobantes
         FROM gestion.valorizacion v JOIN gestion.actor t ON t.id=v.actor_id
         WHERE NOT v.anulada AND v.fecha BETWEEN $1::date AND $2::date GROUP BY 1,2,3 ORDER BY 1,4 DESC`,
        args,
      ),
      pool.query(
        `SELECT to_char(v.periodo,'YYYY-MM') AS mes,
           sum(v.toneladas) FILTER (WHERE t.tipo<>'planta_municipal')::float8 AS inorganicos,
           sum(v.toneladas) FILTER (WHERE t.tipo='planta_municipal')::float8 AS organicos
         FROM gestion.valorizacion v JOIN gestion.actor t ON t.id=v.actor_id
         WHERE NOT v.anulada AND v.fecha BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`,
        args,
      ),
    ]);
    res.json({
      periodo: p,
      servicios: servicios.rows,
      meses: meses.rows,
      sectores: sectores.rows,
      materiales: materiales.rows,
      valorizacion: valorizacion.rows,
      valorizacionMeses: valorMeses.rows,
    });
  });

  // Visitas que sustentan una cifra (servicio, mes, sector y resultado opcionales).
  router.get('/resultados/visitas', async (req, res) => {
    const q = z
      .object({
        servicio: z.string().max(40),
        desde: day,
        hasta: day,
        sector: z.string().max(80).optional(),
        resultado: z.enum(['entrego', 'no_entrego', 'ausente']).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(req.query);
    const rows = (
      await pool.query(
        `SELECT v.id,v.fecha::text,v.resultado,p.id AS "predioId",p.codigo,p.direccion,a.zona AS sector,a.codigo_padron AS "codigoPadron",
           (SELECT coalesce(sum(e.cantidad),0)::float8 FROM gestion.entrega e WHERE e.visita_id=v.id AND NOT e.anulada) AS kg
         FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
         JOIN gestion.servicio s ON s.id=a.servicio_id JOIN gestion.predio p ON p.id=a.predio_id
         WHERE NOT v.anulada AND s.codigo=$1 AND v.fecha BETWEEN $2::date AND $3::date
           AND ($4::text IS NULL OR a.zona=$4) AND ($5::text IS NULL OR v.resultado=$5)
         ORDER BY v.fecha DESC,p.codigo LIMIT 51 OFFSET $6`,
        [q.servicio, q.desde, q.hasta, q.sector ?? null, q.resultado ?? null, (q.page - 1) * 50],
      )
    ).rows;
    res.json({ items: rows.slice(0, 50), siguiente: rows.length > 50 });
  });

  // ---------------------------------------------------------------- padrón oficial (CSV)
  router.get('/padron.csv', auth.privateData, async (req, res) => {
    const q = z
      .object({ servicio: tipo, tipo: z.enum(['domiciliario', 'no_domiciliario']) })
      .strict()
      .parse(req.query);
    const rows = (
      await pool.query(
        `SELECT a.codigo_padron,p.direccion,r.nombre AS representante,a.habitantes,a.establecimiento,
                a.tipo_establecimiento,coalesce(a.zona,p.sector) AS zona
         FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id
         JOIN gestion.predio p ON p.id=a.predio_id LEFT JOIN gestion.persona r ON r.id=a.representante_id
         WHERE s.codigo=ANY($1::text[]) AND a.tipo_generador=$2 AND a.hasta IS NULL AND NOT p.archivado
         ORDER BY a.codigo_padron`,
        [SELECTIVE[q.servicio].codes, q.tipo],
      )
    ).rows;
    const annex = SELECTIVE[q.servicio].annex[q.tipo];
    const header =
      q.tipo === 'domiciliario'
        ? [
            'N.°',
            'Código',
            'Dirección',
            'Nombre y apellido del representante',
            'N.° habitantes',
            'Zona / sector',
          ]
        : [
            'N.°',
            'Código',
            'Dirección',
            'Nombre y apellido del representante',
            'Nombre del establecimiento o institución',
            'Tipo',
            'Zona / sector',
          ];
    const lines = rows.map((r, i) =>
      (q.tipo === 'domiciliario'
        ? [i + 1, r.codigo_padron, r.direccion, r.representante, r.habitantes, r.zona]
        : [
            i + 1,
            r.codigo_padron,
            r.direccion,
            r.representante,
            r.establecimiento,
            r.tipo_establecimiento,
            r.zona,
          ]
      )
        .map(csvCell)
        .join(';'),
    );
    const user = res.locals.user as User;
    await pool.query(
      'INSERT INTO gestion.historial(predio_id,usuario_id,accion,anterior,nuevo) VALUES(NULL,$1,$2,NULL,$3)',
      [user.id, 'padron.exportado', JSON.stringify({ anexo: annex, filas: rows.length })],
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="padron-anexo-${annex}-${q.servicio}-${q.tipo}.csv"`,
    );
    res.send('﻿' + [`Anexo N.° ${annex}`, header.join(';'), ...lines].join('\r\n'));
  });

  // ---------------------------------------------------------------- valorización por actor
  router.get('/actores', async (_req, res) => {
    res.json({
      items: (
        await pool.query(
          'SELECT id,codigo,nombre,tipo,registro,socios,vigente FROM gestion.actor ORDER BY tipo,nombre',
        )
      ).rows,
    });
  });
  router.get('/valorizacion', async (req, res) => {
    const p = period.parse(req.query);
    res.json({
      items: (
        await pool.query(
          `SELECT v.id,t.nombre AS actor,t.tipo,to_char(v.periodo,'YYYY-MM') AS periodo,v.fecha::text,v.material,
                  v.toneladas::float8,v.comprobante_tipo AS "comprobanteTipo",v.comprobante_numero AS "comprobanteNumero",
                  v.observaciones,v.anulada
           FROM gestion.valorizacion v JOIN gestion.actor t ON t.id=v.actor_id
           WHERE v.fecha BETWEEN $1::date AND $2::date ORDER BY v.fecha DESC,t.nombre,v.material LIMIT 500`,
          [p.desde, p.hasta],
        )
      ).rows,
    });
  });
  router.post('/valorizacion', auth.write, async (req, res) => {
    const d = valorizationInput.parse(req.body);
    const user = res.locals.user as User;
    if (d.fecha > limaToday())
      throw new AppError(400, 'INVALID_DATE', 'No se registran comprobantes con fecha futura.');
    const row = await transaction(pool, async (c) => {
      await assertOpenPeriod(c, d.fecha);
      const actor = (await c.query('SELECT id,vigente FROM gestion.actor WHERE id=$1', [d.actorId]))
        .rows[0];
      if (!actor?.vigente)
        throw new AppError(404, 'NOT_FOUND', 'Actor no encontrado o no vigente.');
      const created = (
        await c.query(
          `INSERT INTO gestion.valorizacion(actor_id,periodo,fecha,material,toneladas,comprobante_tipo,comprobante_numero,observaciones,registrado_por)
           VALUES($1,date_trunc('month',$2::date)::date,$2,$3,$4,$5,$6,$7,$8) RETURNING id,periodo::text,toneladas::float8`,
          [
            d.actorId,
            d.fecha,
            d.material,
            d.toneladas,
            d.comprobanteTipo,
            d.comprobanteNumero,
            d.observaciones,
            user.id,
          ],
        )
      ).rows[0];
      await audit(c, user, null, 'valorizacion.registrada', null, { ...created, ...d });
      return created;
    });
    res.status(201).json(row);
  });

  return router;
}
