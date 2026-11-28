import { Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import { compliance, limaToday } from './gestion.ejecucion.js';
import { monthName } from './gestion.periodo.js';
import type { User } from './gestion.schema.js';

// Cierre del mes y reportes oficiales. Antes de cerrar se ve lo que falta (tickets sin registrar,
// rutas sin llegada, días sin servicio sin aviso, comprobantes que faltan); al cerrar se guarda la
// foto de las cifras y el mes queda bloqueado. De esas cifras salen el reporte para SIGERSOL y el
// resumen para el concejo, sin armar nada a mano.

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const SELECTIVOS = ['SIM-ORGANICOS', 'SIM-RECICLABLES'];
// Separador «;» y coma decimal, como abre Excel en español (Perú).
const csvCell = (value: unknown) => {
  if (typeof value === 'number') return String(value).replace('.', ',');
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const monthRange = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(last).padStart(2, '0')}` };
};
const previousMonth = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, '0')}`;
};
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export interface Resumen {
  mes: string;
  desde: string;
  hasta: string;
  recoleccion: {
    toneladas: number;
    tickets: number;
    viajes: number;
    programadas: number;
    ejecutadas: number;
    completadas: number;
    interrumpidas: number;
    pasos: number;
    puntuales: number;
    vehiculos: number;
    rutas: {
      id: string;
      nombre: string;
      programadas: number;
      completadas: number;
      toneladas: number;
    }[];
  };
  selectiva: {
    codigo: string;
    nombre: string;
    inscritos: number;
    domiciliarios: number;
    noDomiciliarios: number;
    visitas: number;
    conEntrega: number;
    participantes: number;
    kg: number;
  }[];
  materiales: { material: string; kg: number; entregas: number; medidas: number }[];
  valorizacion: {
    actor: string;
    tipo: string;
    material: string;
    toneladas: number;
    comprobantes: number;
  }[];
  recicladores: { asociaciones: number; socios: number };
  avisos: number;
}

/** Cifras del mes, calculadas desde los registros (o tomadas de la foto si el mes está cerrado). */
export async function monthSummary(c: Pool | PoolClient, mes: string): Promise<Resumen> {
  const { desde, hasta } = monthRange(mes);
  const [weigh, comp, vehicles, selective, materials, valor, recyclers, notices] =
    await Promise.all([
      c.query(
        `SELECT count(*)::int AS tickets,coalesce(sum(peso_neto_kg),0)::float8 AS kg
       FROM gestion.pesaje WHERE NOT anulado AND destino='relleno' AND fecha BETWEEN $1::date AND $2::date`,
        [desde, hasta],
      ),
      compliance(c, desde, hasta),
      c.query(
        `SELECT count(DISTINCT vehiculo)::int AS n FROM gestion.ruta_ejecucion
       WHERE NOT anulada AND fecha BETWEEN $1::date AND $2::date`,
        [desde, hasta],
      ),
      c.query(
        `SELECT s.codigo,s.nombre,
         (SELECT count(*)::int FROM gestion.participacion x WHERE x.servicio_id=s.id AND x.desde<=$2::date AND (x.hasta IS NULL OR x.hasta>=$2::date)) AS inscritos,
         (SELECT count(*)::int FROM gestion.participacion x WHERE x.servicio_id=s.id AND x.desde<=$2::date AND (x.hasta IS NULL OR x.hasta>=$2::date) AND x.tipo_generador='domiciliario') AS domiciliarios,
         (SELECT count(*)::int FROM gestion.participacion x WHERE x.servicio_id=s.id AND x.desde<=$2::date AND (x.hasta IS NULL OR x.hasta>=$2::date) AND x.tipo_generador='no_domiciliario') AS "noDomiciliarios",
         (SELECT count(*)::int FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
            WHERE a.servicio_id=s.id AND NOT v.anulada AND v.fecha BETWEEN $1::date AND $2::date) AS visitas,
         (SELECT count(*)::int FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
            WHERE a.servicio_id=s.id AND NOT v.anulada AND v.resultado='entrego' AND v.fecha BETWEEN $1::date AND $2::date) AS "conEntrega",
         (SELECT count(DISTINCT a.id)::int FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
            WHERE a.servicio_id=s.id AND NOT v.anulada AND v.resultado='entrego' AND v.fecha BETWEEN $1::date AND $2::date) AS participantes,
         (SELECT coalesce(sum(e.cantidad),0)::float8 FROM gestion.entrega e JOIN gestion.participacion a ON a.id=e.participacion_id
            WHERE a.servicio_id=s.id AND NOT e.anulada AND e.unidad='kg' AND e.fecha BETWEEN $1::date AND $2::date) AS kg
       FROM gestion.servicio s WHERE s.codigo=ANY($3::text[]) ORDER BY s.nombre`,
        [desde, hasta, SELECTIVOS],
      ),
      c.query(
        `SELECT e.material,coalesce(sum(e.cantidad),0)::float8 AS kg,count(*)::int AS entregas,count(e.cantidad)::int AS medidas
       FROM gestion.entrega e WHERE NOT e.anulada AND e.visita_id IS NOT NULL AND e.fecha BETWEEN $1::date AND $2::date
       GROUP BY 1 ORDER BY 2 DESC`,
        [desde, hasta],
      ),
      c.query(
        `SELECT t.nombre AS actor,t.tipo,v.material,sum(v.toneladas)::float8 AS toneladas,count(*)::int AS comprobantes
       FROM gestion.valorizacion v JOIN gestion.actor t ON t.id=v.actor_id
       WHERE NOT v.anulada AND v.periodo=$1::date GROUP BY 1,2,3 ORDER BY 1,4 DESC`,
        [desde],
      ),
      c.query(
        `SELECT count(*)::int AS asociaciones,coalesce(sum(socios),0)::int AS socios FROM gestion.actor
       WHERE vigente AND tipo='asociacion_recicladores'`,
      ),
      c.query(
        `SELECT count(*)::int AS n FROM bagua_master.aviso_servicio
       WHERE NOT retirado AND desde <= $2::date AND hasta >= $1::date`,
        [desde, hasta],
      ),
    ]);
  const rows = comp.rows as {
    id: string;
    nombre: string;
    programadas: number;
    ejecutadas: number;
    completadas: number;
    interrumpidas: number;
    pasos: number;
    puntuales: number;
    viajes: number;
    kg: number;
  }[];
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((n, r) => n + Number(r[k]), 0);
  return {
    mes,
    desde,
    hasta,
    recoleccion: {
      toneladas: round(weigh.rows[0].kg / 1000, 2),
      tickets: weigh.rows[0].tickets,
      viajes: sum('viajes'),
      programadas: sum('programadas'),
      ejecutadas: sum('ejecutadas'),
      completadas: sum('completadas'),
      interrumpidas: sum('interrumpidas'),
      pasos: sum('pasos'),
      puntuales: sum('puntuales'),
      vehiculos: vehicles.rows[0].n,
      rutas: rows
        .filter((r) => r.programadas || r.ejecutadas)
        .map((r) => ({
          id: r.id,
          nombre: r.nombre,
          programadas: r.programadas,
          completadas: r.completadas,
          toneladas: round(r.kg / 1000, 2),
        })),
    },
    selectiva: selective.rows,
    materiales: materials.rows,
    valorizacion: valor.rows.map((v) => ({ ...v, toneladas: round(v.toneladas, 3) })),
    recicladores: recyclers.rows[0],
    avisos: notices.rows[0].n,
  };
}

interface Pendiente {
  clave: string;
  titulo: string;
  cantidad: number;
  nivel: 'importante' | 'revisar' | 'ok';
  accion: string;
  detalle: string[];
}

/** Lo que conviene resolver antes de cerrar el mes. */
export async function monthChecklist(c: Pool | PoolClient, mes: string): Promise<Pendiente[]> {
  const { desde, hasta } = monthRange(mes);
  const [tickets, open, missed, unweighed, vouchers, silentDays] = await Promise.all([
    c.query(
      `SELECT e.fecha::text,g.nombre,count(x.id)::int AS llegadas,
              (SELECT count(*)::int FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado) AS tickets
       FROM gestion.ruta_ejecucion e
       JOIN gestion.ruta_evento x ON x.ejecucion_id=e.id AND x.tipo='llegada' AND x.destino='relleno'
       LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
       WHERE NOT e.anulada AND e.fecha BETWEEN $1::date AND $2::date
       GROUP BY e.id,g.nombre
       HAVING count(x.id) > (SELECT count(*) FROM gestion.pesaje w WHERE w.ejecucion_id=e.id AND NOT w.anulado)
       ORDER BY 1`,
      [desde, hasta],
    ),
    c.query(
      `SELECT e.fecha::text,g.nombre,e.estado FROM gestion.ruta_ejecucion e
       LEFT JOIN bagua_master.ruta_programacion g ON g.id=e.programacion_id
       WHERE NOT e.anulada AND e.estado='en_curso' AND e.fecha BETWEEN $1::date AND least($2::date,(now() AT TIME ZONE 'America/Lima')::date - 1)
       ORDER BY 1`,
      [desde, hasta],
    ),
    c.query(
      `WITH d AS (SELECT generate_series($1::date, least($2::date,(now() AT TIME ZONE 'America/Lima')::date - 1),'1 day')::date AS fecha)
       SELECT d.fecha::text,p.nombre FROM d
       JOIN bagua_master.ruta_programacion p ON p.vigente AND extract(isodow FROM d.fecha)::smallint = ANY(p.dias)
       WHERE d.fecha >= (SELECT min(e.fecha) FROM gestion.ruta_ejecucion e WHERE e.programacion_id=p.id)
         AND NOT EXISTS (SELECT 1 FROM gestion.ruta_ejecucion e WHERE e.programacion_id=p.id AND e.fecha=d.fecha AND NOT e.anulada)
         AND NOT EXISTS (SELECT 1 FROM bagua_master.aviso_servicio a WHERE a.tipo='suspension' AND NOT a.retirado
                         AND d.fecha BETWEEN a.desde AND a.hasta AND (cardinality(a.programaciones)=0 OR p.id=ANY(a.programaciones)))
       ORDER BY 1`,
      [desde, hasta],
    ),
    c.query(
      `SELECT count(*)::int AS sin_peso,count(*) FILTER (WHERE cantidad IS NOT NULL)::int AS con_peso
       FROM gestion.entrega WHERE NOT anulada AND visita_id IS NOT NULL AND fecha BETWEEN $1::date AND $2::date`,
      [desde, hasta],
    ),
    c.query(
      `SELECT t.nombre FROM gestion.actor t WHERE t.vigente
         AND NOT EXISTS (SELECT 1 FROM gestion.valorizacion v WHERE v.actor_id=t.id AND NOT v.anulada AND v.periodo=$1::date)
       ORDER BY 1`,
      [desde],
    ),
    c.query(
      `WITH d AS (SELECT generate_series($1::date, least($2::date,(now() AT TIME ZONE 'America/Lima')::date - 1),'1 day')::date AS fecha)
       SELECT d.fecha::text,p.nombre FROM d
       JOIN bagua_master.ruta_programacion p ON p.vigente AND p.servicio IN ('organicos','reciclables')
         AND extract(isodow FROM d.fecha)::smallint = ANY(p.dias)
       WHERE NOT EXISTS (SELECT 1 FROM gestion.visita v JOIN gestion.participacion a ON a.id=v.participacion_id
                           JOIN gestion.servicio s ON s.id=a.servicio_id
                          WHERE NOT v.anulada AND v.fecha=d.fecha
                            AND s.codigo = CASE p.servicio WHEN 'organicos' THEN 'SIM-ORGANICOS' ELSE 'SIM-RECICLABLES' END)
         AND NOT EXISTS (SELECT 1 FROM bagua_master.aviso_servicio a WHERE a.tipo='suspension' AND NOT a.retirado
                         AND d.fecha BETWEEN a.desde AND a.hasta AND (cardinality(a.programaciones)=0 OR p.id=ANY(a.programaciones)))
       ORDER BY 1`,
      [desde, hasta],
    ),
  ]);
  const short = (n: string | null) => {
    const t = (n ?? '')
      .replace(/^Recolección convencional · /, '')
      .replace(/^Recolección selectiva de /, '')
      .replace(/^Recolección /, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const w = unweighed.rows[0];
  const total = w.sin_peso;
  const measured = w.con_peso;
  return [
    {
      clave: 'tickets',
      titulo: 'Llegadas al relleno sin ticket de balanza',
      cantidad: tickets.rows.reduce((n, r) => n + r.llegadas - r.tickets, 0),
      nivel: tickets.rowCount ? 'importante' : 'ok',
      accion:
        'Registra los tickets en Operación › Pesaje: sin ellos las toneladas del mes quedan cortas.',
      detalle: tickets.rows.map((r) => `${r.fecha} · ${short(r.nombre)}`),
    },
    {
      clave: 'en_curso',
      titulo: 'Rutas que quedaron sin llegada registrada',
      cantidad: open.rowCount ?? 0,
      nivel: open.rowCount ? 'revisar' : 'ok',
      accion: 'Pide al chofer que marque la llegada o anula la ejecución con su motivo.',
      detalle: open.rows.map((r) => `${r.fecha} · ${short(r.nombre)}`),
    },
    {
      clave: 'no_salio',
      titulo: 'Días programados sin ruta y sin aviso',
      cantidad: missed.rowCount ?? 0,
      nivel: missed.rowCount ? 'importante' : 'ok',
      accion: 'Publica el aviso de suspensión que corresponda o registra la ruta si salió.',
      detalle: missed.rows.map((r) => `${r.fecha} · ${short(r.nombre)}`),
    },
    {
      clave: 'selectiva',
      titulo: 'Días de recolección selectiva sin visitas registradas',
      cantidad: silentDays.rowCount ?? 0,
      nivel: silentDays.rowCount ? 'revisar' : 'ok',
      accion: 'Confirma con el promotor si salió; si no hubo servicio, publica el aviso.',
      detalle: silentDays.rows.map((r) => `${r.fecha} · ${short(r.nombre)}`),
    },
    {
      clave: 'comprobantes',
      titulo: 'Actores sin comprobante de valorización en el mes',
      cantidad: vouchers.rowCount ?? 0,
      nivel: vouchers.rowCount ? 'importante' : 'ok',
      accion:
        'Pide la factura, boleta o registro de planta: sin comprobante no cuenta como valorizado.',
      detalle: vouchers.rows.map((r) => r.nombre),
    },
    {
      clave: 'sin_peso',
      titulo: 'Entregas selectivas sin peso',
      cantidad: total - measured,
      nivel: total && (total - measured) / total > 0.1 ? 'revisar' : 'ok',
      accion: `${total ? Math.round((100 * measured) / total) : 100} % de las entregas tienen su peso. Pide a los promotores pesar en la puerta.`,
      detalle: [],
    },
  ];
}

export function createClosingRouter(pool: Pool, auth: { write: RequestHandler }) {
  const router = Router();
  const admin: RequestHandler = (_req, res, next) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración cierra o reabre un mes.');
    next();
  };

  router.get('/periodos', async (_req, res) => {
    const rows = (
      await pool.query(
        `WITH m AS (
           SELECT generate_series(
             least(date_trunc('month',coalesce((SELECT min(fecha) FROM gestion.visita),now()::date)),
                   date_trunc('month',coalesce((SELECT min(fecha) FROM gestion.ruta_ejecucion),now()::date))),
             date_trunc('month',(now() AT TIME ZONE 'America/Lima')::date),'1 month')::date AS periodo)
         SELECT to_char(m.periodo,'YYYY-MM') AS mes,c.id IS NOT NULL AS cerrado,c.cerrado_en AS "cerradoEn",
                u.nombre AS "cerradoPor",c.observaciones,
                (c.resumen->'recoleccion'->>'toneladas')::float8 AS toneladas
         FROM m LEFT JOIN gestion.periodo_cierre c ON c.periodo=m.periodo AND c.reabierto_en IS NULL
         LEFT JOIN gestion.usuario u ON u.id=c.cerrado_por ORDER BY m.periodo DESC`,
      )
    ).rows;
    res.json({ items: rows, mesActual: limaToday().slice(0, 7) });
  });

  router.get('/periodos/:mes', async (req, res) => {
    const mes = month.parse(req.params.mes);
    const closed = (
      await pool.query(
        `SELECT c.resumen,c.cerrado_en AS "cerradoEn",c.observaciones,u.nombre AS "cerradoPor"
         FROM gestion.periodo_cierre c JOIN gestion.usuario u ON u.id=c.cerrado_por
         WHERE c.periodo=$1::date AND c.reabierto_en IS NULL`,
        [`${mes}-01`],
      )
    ).rows[0];
    const history = (
      await pool.query(
        `SELECT c.cerrado_en AS "cerradoEn",u.nombre AS "cerradoPor",c.reabierto_en AS "reabiertoEn",
                r.nombre AS "reabiertoPor",c.motivo_reapertura AS motivo
         FROM gestion.periodo_cierre c JOIN gestion.usuario u ON u.id=c.cerrado_por
         LEFT JOIN gestion.usuario r ON r.id=c.reabierto_por
         WHERE c.periodo=$1::date ORDER BY c.cerrado_en DESC`,
        [`${mes}-01`],
      )
    ).rows;
    res.json({
      mes,
      nombre: monthName(`${mes}-01`),
      terminado: mes < limaToday().slice(0, 7),
      cierre: closed ? { ...closed, resumen: undefined } : null,
      resumen: closed ? closed.resumen : await monthSummary(pool, mes),
      pendientes: closed ? [] : await monthChecklist(pool, mes),
      historial: history,
    });
  });

  router.post('/periodos/:mes/cerrar', auth.write, admin, async (req, res) => {
    const mes = month.parse(req.params.mes);
    const d = z
      .object({ observaciones: z.string().trim().max(1000).default('') })
      .strict()
      .parse(req.body);
    if (mes >= limaToday().slice(0, 7))
      throw new AppError(409, 'MONTH_OPEN', 'Solo se cierra un mes terminado.');
    const user = res.locals.user as User;
    const row = await transaction(pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`cierre|${mes}`]);
      const already = (
        await c.query(
          'SELECT 1 FROM gestion.periodo_cierre WHERE periodo=$1::date AND reabierto_en IS NULL',
          [`${mes}-01`],
        )
      ).rowCount;
      if (already) throw new AppError(409, 'ALREADY_CLOSED', 'Ese mes ya está cerrado.');
      const pending = (await monthChecklist(c, mes)).filter((p) => p.nivel === 'importante');
      if (pending.length && d.observaciones.length < 10)
        throw new AppError(
          409,
          'PENDING_ITEMS',
          `Quedan pendientes importantes (${pending.map((p) => p.titulo.toLowerCase()).join('; ')}). Resuélvelos o explica en las observaciones por qué se cierra así.`,
        );
      const summary = await monthSummary(c, mes);
      const created = (
        await c.query(
          `INSERT INTO gestion.periodo_cierre(periodo,cerrado_por,resumen,observaciones)
           VALUES($1::date,$2,$3,$4) RETURNING id,cerrado_en AS "cerradoEn"`,
          [`${mes}-01`, user.id, summary, d.observaciones],
        )
      ).rows[0];
      await audit(c, user, null, 'periodo.cerrado', null, {
        mes,
        toneladas: summary.recoleccion.toneladas,
        observaciones: d.observaciones,
      });
      return created;
    });
    res.status(201).json(row);
  });

  router.post('/periodos/:mes/reabrir', auth.write, admin, async (req, res) => {
    const mes = month.parse(req.params.mes);
    const d = z
      .object({ motivo: z.string().trim().min(5).max(500) })
      .strict()
      .parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const row = (
        await c.query(
          `UPDATE gestion.periodo_cierre SET reabierto_por=$2,reabierto_en=now(),motivo_reapertura=$3
           WHERE periodo=$1::date AND reabierto_en IS NULL RETURNING id`,
          [`${mes}-01`, user.id, d.motivo],
        )
      ).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Ese mes no está cerrado.');
      await audit(c, user, null, 'periodo.reabierto', { mes }, { motivo: d.motivo });
    });
    res.status(204).end();
  });

  // Resumen para el concejo: el mes, el anterior para comparar y lo que hay que saber.
  router.get('/periodos/:mes/concejo', async (req, res) => {
    const mes = month.parse(req.params.mes);
    const load = async (m: string) => {
      const closed = (
        await pool.query(
          'SELECT resumen FROM gestion.periodo_cierre WHERE periodo=$1::date AND reabierto_en IS NULL',
          [`${m}-01`],
        )
      ).rows[0];
      return {
        cerrado: !!closed,
        resumen: (closed?.resumen as Resumen) ?? (await monthSummary(pool, m)),
      };
    };
    const [current, previous, missed] = await Promise.all([
      load(mes),
      load(previousMonth(mes)),
      monthChecklist(pool, mes),
    ]);
    res.json({
      mes,
      nombre: monthName(`${mes}-01`),
      anterior: {
        mes: previousMonth(mes),
        nombre: monthName(`${previousMonth(mes)}-01`),
        ...previous,
      },
      ...current,
      pendientes: current.cerrado ? [] : missed.filter((p) => p.nivel !== 'ok'),
    });
  });

  // Reporte para SIGERSOL Municipal: los datos que el sistema registra, por sección, para uno o
  // varios meses (un año completo para el reporte anual). Lo que el sistema no registra se marca
  // para completarlo en la oficina.
  router.get('/reportes/sigersol.csv', async (req, res) => {
    const q = z.object({ desde: month, hasta: month }).strict().parse(req.query);
    if (q.hasta < q.desde) throw new AppError(400, 'INVALID_RANGE', 'El periodo está invertido.');
    const months: string[] = [];
    for (let m = q.desde; m <= q.hasta && months.length < 24;) {
      months.push(m);
      const [y, mm] = m.split('-').map(Number);
      m = mm === 12 ? `${y! + 1}-01` : `${y}-${String(mm! + 1).padStart(2, '0')}`;
    }
    const summaries: Resumen[] = [];
    for (const m of months) {
      const closed = (
        await pool.query(
          'SELECT resumen FROM gestion.periodo_cierre WHERE periodo=$1::date AND reabierto_en IS NULL',
          [`${m}-01`],
        )
      ).rows[0];
      summaries.push((closed?.resumen as Resumen) ?? (await monthSummary(pool, m)));
    }
    const total = (pick: (s: Resumen) => number) => summaries.reduce((n, s) => n + pick(s), 0);
    const last = summaries.at(-1)!;
    const sel = (code: string) => (s: Resumen) => s.selectiva.find((x) => x.codigo === code);
    const valorBy = (pred: (v: Resumen['valorizacion'][number]) => boolean) =>
      round(
        total((s) => s.valorizacion.filter(pred).reduce((n, v) => n + v.toneladas, 0)),
        3,
      );
    const materials = new Map<string, number>();
    for (const s of summaries)
      for (const v of s.valorizacion.filter((x) => x.tipo !== 'planta_municipal'))
        materials.set(v.material, (materials.get(v.material) ?? 0) + v.toneladas);
    const periodo =
      q.desde === q.hasta
        ? monthName(`${q.desde}-01`)
        : `${monthName(`${q.desde}-01`)} a ${monthName(`${q.hasta}-01`)}`;
    const rows: (string | number | null)[][] = [
      ['Sección', 'Indicador', 'Valor', 'Unidad', 'Origen en WEBGIS BAGUA'],
      [
        'Recolección y transporte',
        'Residuos municipales recolectados',
        round(
          total((s) => s.recoleccion.toneladas),
          2,
        ),
        't',
        'Tickets de balanza del relleno',
      ],
      [
        'Recolección y transporte',
        'Viajes al relleno sanitario',
        total((s) => s.recoleccion.tickets),
        'viajes',
        'Tickets de balanza',
      ],
      [
        'Recolección y transporte',
        'Rutas programadas',
        total((s) => s.recoleccion.programadas),
        'recorridos',
        'Programación de rutas',
      ],
      [
        'Recolección y transporte',
        'Rutas terminadas',
        total((s) => s.recoleccion.completadas),
        'recorridos',
        'Registro del chofer',
      ],
      [
        'Recolección y transporte',
        'Cumplimiento de rutas',
        total((s) => s.recoleccion.programadas)
          ? round(
              (100 * total((s) => s.recoleccion.completadas)) /
                total((s) => s.recoleccion.programadas),
            )
          : null,
        '%',
        'Registro del chofer',
      ],
      [
        'Recolección y transporte',
        'Vehículos que operaron (último mes)',
        last.recoleccion.vehiculos,
        'vehículos',
        'Registro del chofer',
      ],
      [
        'Disposición final',
        'Residuos dispuestos en relleno sanitario',
        round(
          total((s) => s.recoleccion.toneladas),
          2,
        ),
        't',
        'Tickets de balanza del relleno',
      ],
      [
        'Valorización',
        'Residuos orgánicos valorizados',
        valorBy((v) => v.tipo === 'planta_municipal'),
        't',
        'Registro de la planta de compostaje',
      ],
      [
        'Valorización',
        'Residuos inorgánicos valorizados',
        valorBy((v) => v.tipo !== 'planta_municipal'),
        't',
        'Comprobantes de los actores',
      ],
      ...[...materials].map(([m, t]) => [
        'Valorización',
        `Inorgánicos valorizados · ${m}`,
        round(t, 3),
        't',
        'Comprobantes de los actores',
      ]),
      [
        'Programa de segregación en la fuente',
        'Viviendas inscritas · orgánicos',
        sel('SIM-ORGANICOS')(last)?.domiciliarios ?? 0,
        'viviendas',
        'Padrón (anexo 03-C)',
      ],
      [
        'Programa de segregación en la fuente',
        'Generadores no domiciliarios inscritos · orgánicos',
        sel('SIM-ORGANICOS')(last)?.noDomiciliarios ?? 0,
        'generadores',
        'Padrón (anexo 03-D)',
      ],
      [
        'Programa de segregación en la fuente',
        'Viviendas inscritas · reciclables',
        sel('SIM-RECICLABLES')(last)?.domiciliarios ?? 0,
        'viviendas',
        'Padrón (anexo 03-A)',
      ],
      [
        'Programa de segregación en la fuente',
        'Generadores no domiciliarios inscritos · reciclables',
        sel('SIM-RECICLABLES')(last)?.noDomiciliarios ?? 0,
        'generadores',
        'Padrón (anexo 03-B)',
      ],
      [
        'Programa de segregación en la fuente',
        'Participantes que entregaron (último mes)',
        last.selectiva.reduce((n, x) => n + x.participantes, 0),
        'participantes',
        'Visitas de campo',
      ],
      [
        'Programa de segregación en la fuente',
        'Residuos orgánicos recolectados selectivamente',
        round(
          total((s) => (sel('SIM-ORGANICOS')(s)?.kg ?? 0) / 1000),
          3,
        ),
        't',
        'Visitas de campo (pesadas)',
      ],
      [
        'Programa de segregación en la fuente',
        'Residuos inorgánicos recolectados selectivamente',
        round(
          total((s) => (sel('SIM-RECICLABLES')(s)?.kg ?? 0) / 1000),
          3,
        ),
        't',
        'Visitas de campo (pesadas)',
      ],
      [
        'Recicladores',
        'Asociaciones de recicladores formalizadas',
        last.recicladores.asociaciones,
        'asociaciones',
        'Registro de actores (Ley 29419)',
      ],
      [
        'Recicladores',
        'Recicladores asociados',
        last.recicladores.socios,
        'personas',
        'Registro de actores (Ley 29419)',
      ],
      [
        'Completar en oficina',
        'Generación per cápita domiciliaria',
        null,
        'kg/hab/día',
        'Estudio de caracterización',
      ],
      [
        'Completar en oficina',
        'Población atendida por el servicio',
        null,
        'habitantes',
        'INEI / padrón municipal',
      ],
      [
        'Completar en oficina',
        'Barrido de calles',
        null,
        'km lineales',
        'Área de limpieza pública',
      ],
      [
        'Completar en oficina',
        'Costo del servicio de limpieza pública',
        null,
        'S/',
        'Presupuesto ejecutado',
      ],
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sigersol-bagua-${q.desde}${q.desde === q.hasta ? '' : `-a-${q.hasta}`}.csv"`,
    );
    res.send(
      '﻿' +
        [
          `Reporte para SIGERSOL Municipal · Municipalidad Provincial de Bagua · ${periodo}`,
          ...rows.map((r) => r.map(csvCell).join(';')),
        ].join('\r\n'),
    );
  });

  return router;
}
