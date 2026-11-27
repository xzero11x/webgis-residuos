import { describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import {
  createExecutionRouter,
  eventInput,
  programStatus,
  startInput,
  weighingInput,
} from './gestion.ejecucion.js';
import { describeDays, noticeInput, scheduleChange } from './gestion.avisos.js';
import { assertOpenPeriod, monthName } from './gestion.periodo.js';
import { AppError } from '../../shared/app-error.js';

const userId = 'af933138-a3c8-4038-b5cf-2b03322a0bb2';
const clave = '7d3c2b1a-1111-4222-8333-944455556666';

function setup(rol: string, answer: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const rows = answer(sql, params);
    return { rows, rowCount: rows.length };
  });
  const connect = vi.fn().mockResolvedValue({ query, release: vi.fn() });
  const guard =
    (blocked: string): RequestHandler =>
    (_req, res, next) => {
      if (res.locals.user.rol === blocked) throw new AppError(403, 'FORBIDDEN', 'No permitido.');
      next();
    };
  const app = express();
  app.use(express.json());
  app.use((_q, res, next) => {
    res.locals.user = { id: userId, rol, nombre: 'Prueba', usuario: 'prueba' };
    next();
  });
  app.use(
    createExecutionRouter({ query, connect } as unknown as Pool, {
      write: guard('consulta'),
      privateData: guard('consulta'),
    }),
  );
  app.use((e: Error, _q: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    res
      .status(e instanceof AppError ? e.statusCode : 400)
      .json({ code: e instanceof AppError ? e.code : 'VALIDATION' });
  });
  return { app, query };
}

describe('Ejecución de rutas', () => {
  it('la salida exige clave, programación, fecha y hora con zona', () => {
    const ok = {
      clave,
      programacionId: 'PRG-1001-CONV',
      fecha: '2026-11-27',
      momento: '2026-11-27T06:02:00-05:00',
    };
    expect(startInput.safeParse(ok).success).toBe(true);
    expect(startInput.safeParse({ ...ok, momento: '2026-11-27 06:02' }).success).toBe(false);
    expect(startInput.safeParse({ ...ok, lon: -70, lat: -5.6 }).success).toBe(false);
  });

  it('un paso necesita su punto; una llegada no lleva punto', () => {
    const base = { clave, momento: '2026-11-27T07:10:00Z' };
    expect(
      eventInput.safeParse({ ...base, tipo: 'paso', puntoId: 'PRG-1001-CONV-P03' }).success,
    ).toBe(true);
    expect(eventInput.safeParse({ ...base, tipo: 'llegada', puntoId: 'X-P01' }).success).toBe(
      false,
    );
    expect(eventInput.safeParse({ ...base, tipo: 'llegada' }).success).toBe(true);
  });

  it('el ticket exige peso bruto mayor que la tara', () => {
    const t = { fecha: '2026-11-26', ticket: 'RS-041300', vehiculo: 'EGW-781', taraKg: 11200 };
    expect(weighingInput.safeParse({ ...t, pesoBrutoKg: 17600 }).success).toBe(true);
    expect(weighingInput.safeParse({ ...t, pesoBrutoKg: 11000 }).success).toBe(false);
  });

  it('situación del día según la hora y lo registrado', () => {
    expect(programStatus('2026-11-27', '2026-11-27', 300, '06:00', null)).toBe('pendiente');
    expect(programStatus('2026-11-27', '2026-11-27', 365, '06:00', null)).toBe('por_iniciar');
    expect(programStatus('2026-11-27', '2026-11-27', 381, '06:00', null)).toBe('sin_iniciar');
    expect(programStatus('2026-11-26', '2026-11-27', 0, '06:00', null)).toBe('no_ejecutada');
    expect(programStatus('2026-11-26', '2026-11-27', 0, '06:00', null, true)).toBe('suspendida');
    expect(programStatus('2026-11-27', '2026-11-27', 381, '06:00', 'en_curso')).toBe('en_curso');
  });

  it('un perfil de consulta no registra la ruta', async () => {
    const { app } = setup('consulta');
    const res = await request(app).post('/ruta/salida').send({
      clave,
      programacionId: 'PRG-1001-CONV',
      fecha: '2026-11-27',
      momento: new Date().toISOString(),
    });
    expect(res.status).toBe(403);
  });

  it('una salida repetida (misma clave) devuelve la ya registrada', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const { app, query } = setup('registro', (sql) =>
      sql.includes('FROM gestion.ruta_ejecucion WHERE clave')
        ? [{ id: clave, estado: 'en_curso' }]
        : [],
    );
    const res = await request(app).post('/ruta/salida').send({
      clave,
      programacionId: 'PRG-1001-CONV',
      fecha: today,
      momento: new Date().toISOString(),
    });
    expect(res.status).toBe(200);
    expect(res.body.repetida).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
  });

  it('no se registra la ruta de un mes cerrado', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ x: 1 }], rowCount: 1 })),
    } as unknown as Pool;
    await expect(assertOpenPeriod(pool, '2026-10-15')).rejects.toMatchObject({
      code: 'PERIOD_CLOSED',
    });
    expect(monthName('2026-10-15')).toBe('octubre de 2026');
  });
});

describe('Avisos y cambios de programación', () => {
  it('un aviso no termina antes de empezar', () => {
    const a = {
      tipo: 'suspension',
      titulo: 'Feriado sin servicio',
      mensaje: 'No hay recolección.',
    };
    expect(noticeInput.safeParse({ ...a, desde: '2026-12-08', hasta: '2026-12-09' }).success).toBe(
      true,
    );
    expect(noticeInput.safeParse({ ...a, desde: '2026-12-09', hasta: '2026-12-08' }).success).toBe(
      false,
    );
  });

  it('un cambio de horario exige motivo y fin posterior al inicio', () => {
    const c = {
      dias: [1, 3, 5],
      horaInicio: '06:00',
      horaFin: '12:00',
      vehiculo: 'Compactadora EGW-781',
      operador: 'Municipalidad',
      sectores: ['Cercado'],
      motivo: 'Pedido de los vecinos',
      desde: '2026-12-01',
    };
    expect(scheduleChange.safeParse(c).success).toBe(true);
    expect(scheduleChange.safeParse({ ...c, horaFin: '05:00' }).success).toBe(false);
    expect(scheduleChange.safeParse({ ...c, motivo: 'no' }).success).toBe(false);
    expect(scheduleChange.safeParse({ ...c, dias: [1, 1] }).success).toBe(false);
  });

  it('describe los días en castellano', () => {
    expect(describeDays([5, 1, 3])).toBe('lunes, miércoles y viernes');
    expect(describeDays([6])).toBe('sábado');
  });
});
