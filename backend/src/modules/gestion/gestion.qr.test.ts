import { describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { createQrRouter } from './gestion.qr.js';
import { AppError } from '../../shared/app-error.js';

const userId = 'af933138-a3c8-4038-b5cf-2b03322a0bb2';
const predioId = '0b8f2e57-4d3c-4f44-9f6b-0e1f7d1c2a33';

function setup(rol: string, answer: (sql: string) => unknown[] = () => []) {
  const query = vi.fn(async (sql: string) => {
    const rows = answer(sql);
    return { rows, rowCount: rows.length };
  });
  const connect = vi.fn().mockResolvedValue({ query, release: vi.fn() });
  const write: RequestHandler = (_req, res, next) => {
    if (res.locals.user.rol === 'consulta') throw new AppError(403, 'FORBIDDEN', 'Solo lectura.');
    next();
  };
  const app = express();
  app.use(express.json());
  app.use((_q, res, next) => {
    res.locals.user = { id: userId, rol, nombre: 'Prueba', usuario: 'prueba' };
    next();
  });
  app.use(createQrRouter({ query, connect } as unknown as Pool, { write }));
  app.use((e: Error, _q: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    res
      .status(e instanceof AppError ? e.statusCode : 400)
      .json({ code: e instanceof AppError ? e.code : 'VALIDATION' });
  });
  return { app, query };
}

describe('Stickers QR', () => {
  it('rechaza códigos mal escritos antes de consultar la base', async () => {
    const { app, query } = setup('registro');
    expect((await request(app).get('/qr/JH1083G4')).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('las etiquetas no se confunden con un código', async () => {
    const { app } = setup('registro', (sql) =>
      sql.includes('count(DISTINCT p.id)') ? [{ n: 3 }] : [],
    );
    const res = await request(app).get('/qr/etiquetas?servicio=organicos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ etiquetas: [], sinCodigo: 3 });
  });

  it('un sticker reemplazado ya no abre el predio', async () => {
    const { app } = setup('registro', (sql) =>
      sql.includes('UPDATE gestion.codigo_qr q SET escaneos')
        ? [{ codigo: 'JH1083G3', estado: 'revocado', predioId, ubicacion: null }]
        : [],
    );
    const res = await request(app).get('/qr/jh10-83g3');
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('QR_REVOKED');
  });

  it('el perfil de consulta no genera ni revoca stickers', async () => {
    const { app, query } = setup('consulta');
    expect((await request(app).post(`/predios/${predioId}/qr`).send({})).status).toBe(403);
    expect(
      (await request(app).post('/qr/JH1083G3/revocar').send({ motivo: 'Sticker dañado' })).status,
    ).toBe(403);
    expect((await request(app).post('/qr/lote').send({})).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('si el predio ya tiene sticker vigente no genera otro', async () => {
    const { app, query } = setup('registro', (sql) => {
      if (sql.includes('FROM gestion.predio WHERE id=$1'))
        return [{ id: predioId, archivado: false }];
      if (sql.includes("estado='activo'")) return [{ codigo: 'JH1083G3' }];
      return [];
    });
    const res = await request(app).post(`/predios/${predioId}/qr`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ codigo: 'JH1083G3', nuevo: false });
    expect(
      query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO gestion.codigo_qr')),
    ).toBe(false);
  });
});
