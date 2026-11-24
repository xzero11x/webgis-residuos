import { describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { createOperationRouter, visitInput } from './gestion.operacion.js';
import { AppError } from '../../shared/app-error.js';

const userId = 'af933138-a3c8-4038-b5cf-2b03322a0bb2';
const partId = '0b8f2e57-4d3c-4f44-9f6b-0e1f7d1c2a33';
const clave = '7d3c2b1a-1111-4222-8333-944455556666';

function setup(rol: string, answer: (sql: string) => unknown[] = () => []) {
  const query = vi.fn(async (sql: string) => {
    const rows = answer(sql);
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
    createOperationRouter({ query, connect } as unknown as Pool, {
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

const visit = (extra: Record<string, unknown> = {}) => ({
  clave,
  participacionId: partId,
  fecha: '2026-11-20',
  resultado: 'entrego',
  entregas: [{ material: 'Residuos orgánicos', cantidad: 2.4 }],
  ...extra,
});

describe('Visitas de recolección', () => {
  it('una entrega lleva materiales; no entregó o ausente, ninguno', () => {
    expect(visitInput.safeParse(visit()).success).toBe(true);
    expect(visitInput.safeParse(visit({ entregas: [] })).success).toBe(false);
    expect(visitInput.safeParse(visit({ resultado: 'ausente' })).success).toBe(false);
    expect(visitInput.safeParse(visit({ resultado: 'no_entrego', entregas: [] })).success).toBe(
      true,
    );
    // Sin medición es válido (cantidad nula), pero no cero ni negativa.
    expect(
      visitInput.safeParse(visit({ entregas: [{ material: 'Vidrio', cantidad: null }] })).success,
    ).toBe(true);
    expect(
      visitInput.safeParse(visit({ entregas: [{ material: 'Vidrio', cantidad: 0 }] })).success,
    ).toBe(false);
    expect(
      visitInput.safeParse(
        visit({
          entregas: [
            { material: 'Vidrio', cantidad: 1 },
            { material: 'Vidrio', cantidad: 2 },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('el perfil de consulta no ve el recorrido de campo ni registra visitas', async () => {
    const { app, query } = setup('consulta');
    expect((await request(app).get('/campo?servicio=organicos')).status).toBe(403);
    expect((await request(app).post('/visitas').send(visit())).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('la misma clave no crea una segunda visita (reintentos sin conexión)', async () => {
    const { app, query } = setup('registro', (sql) =>
      sql.includes('WHERE clave=$1') ? [{ id: 'existente' }] : [],
    );
    const res = await request(app).post('/visitas').send(visit());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'existente', repetida: true });
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(false);
  });

  it('no permite dos visitas del mismo participante el mismo día', async () => {
    const { app } = setup('registro', (sql) => {
      if (sql.includes('FROM gestion.participacion a'))
        return [{ id: partId, predio_id: 'p', desde: '2026-01-01', hasta: null, archivado: false }];
      if (sql.includes('FROM gestion.material')) return [{ nombre: 'Residuos orgánicos' }];
      if (sql.includes('participacion_id=$1 AND fecha=$2')) return [{ id: 'otra' }];
      return [];
    });
    const res = await request(app).post('/visitas').send(visit());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE');
  });

  it('rechaza fechas fuera del periodo de participación y materiales no catalogados', async () => {
    const outside = setup('registro', (sql) =>
      sql.includes('FROM gestion.participacion a')
        ? [{ id: partId, predio_id: 'p', desde: '2026-11-21', hasta: null, archivado: false }]
        : [],
    );
    expect((await request(outside.app).post('/visitas').send(visit())).body.code).toBe(
      'INVALID_DATE',
    );
    const unknown = setup('registro', (sql) =>
      sql.includes('FROM gestion.participacion a')
        ? [{ id: partId, predio_id: 'p', desde: '2026-01-01', hasta: null, archivado: false }]
        : [],
    );
    expect((await request(unknown.app).post('/visitas').send(visit())).body.code).toBe(
      'UNKNOWN_MATERIAL',
    );
  });
});

describe('Padrón oficial', () => {
  it('exporta el anexo con sus columnas y neutraliza fórmulas', async () => {
    const { app } = setup('registro', (sql) =>
      sql.includes('FROM gestion.participacion a JOIN gestion.servicio')
        ? [
            {
              codigo_padron: 'REC-0001',
              direccion: '=HYPERLINK("x")',
              representante: 'Ana Díaz Rojas',
              habitantes: 4,
              zona: 'Cercado',
            },
          ]
        : [],
    );
    const res = await request(app).get('/padron.csv?servicio=reciclables&tipo=domiciliario');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('padron-anexo-03-A');
    expect(res.text).toContain('Anexo N.° 03-A');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
