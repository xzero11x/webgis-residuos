import { describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { createMapCorrectionsRouter, mapCorrectionInput } from './gestion.map-corrections.js';
import { AppError } from '../../shared/app-error.js';

const userId = 'af933138-a3c8-4038-b5cf-2b03322a0bb2';
const correctionId = '0b8f2e57-4d3c-4f44-9f6b-0e1f7d1c2a33';
const plaza: [number, number][] = [
  [-78.5317, -5.6391],
  [-78.5316, -5.6391],
  [-78.5316, -5.639],
  [-78.5317, -5.639],
];

function setup(rol: string, answer: (sql: string) => { rows: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string) => {
    const result = answer(sql);
    return { rowCount: result.rows.length, ...result };
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
  app.use(createMapCorrectionsRouter({ query, connect } as unknown as Pool, write));
  app.use((e: Error, _q: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    res
      .status(e instanceof AppError ? e.statusCode : 400)
      .json({ code: e instanceof AppError ? e.code : 'VALIDATION', message: e.message });
  });
  return { app, query };
}

const sqlOf = (query: ReturnType<typeof vi.fn>) => query.mock.calls.map((c) => String(c[0]));

describe('Correcciones cartográficas del mapa', () => {
  it('valida la forma de cada acción y la ventana de Bagua', () => {
    const ok = (body: unknown) => mapCorrectionInput.safeParse(body).success;
    expect(
      ok({ accion: 'ocultar', tabla: 'edificio', elementoId: 'abc', motivo: 'No existe' }),
    ).toBe(true);
    expect(ok({ accion: 'ocultar', tabla: 'edificio', elementoId: 'abc', motivo: 'x' })).toBe(
      false,
    );
    // Solo los lugares se mueven, y dentro del ámbito.
    expect(
      ok({
        accion: 'mover',
        tabla: 'edificio',
        elementoId: 'abc',
        punto: [-78.53, -5.63],
        motivo: 'Mal',
      }),
    ).toBe(false);
    expect(
      ok({
        accion: 'mover',
        tabla: 'lugar',
        elementoId: 'abc',
        punto: [-77, -5.63],
        motivo: 'Mal',
      }),
    ).toBe(false);
    expect(
      ok({ accion: 'agregar', tabla: 'edificio', anillo: plaza.slice(0, 2), motivo: 'Falta' }),
    ).toBe(false);
    expect(ok({ accion: 'agregar', tabla: 'edificio', anillo: plaza, motivo: 'Falta casa' })).toBe(
      true,
    );
  });

  it('el perfil consulta ve las correcciones pero no puede crearlas', async () => {
    const { app, query } = setup('consulta', () => ({ rows: [] }));
    expect((await request(app).get('/correcciones-mapa')).status).toBe(200);
    const denied = await request(app)
      .post('/correcciones-mapa')
      .send({ accion: 'ocultar', tabla: 'edificio', elementoId: 'abc', motivo: 'No existe' });
    expect(denied.status).toBe(403);
    expect(sqlOf(query).some((s) => s.includes('INSERT'))).toBe(false);
  });

  it('marca como inexistente un edificio que existe y lo audita', async () => {
    const { app, query } = setup('registro', (sql) => {
      if (sql.includes('FROM bagua_master.edificio WHERE')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes("accion='ocultar' AND anulada_en IS NULL")) return { rows: [] };
      if (sql.startsWith('INSERT INTO bagua_master.correccion'))
        return { rows: [{ id: correctionId, accion: 'ocultar' }] };
      return { rows: [] };
    });
    const response = await request(app)
      .post('/correcciones-mapa')
      .send({ accion: 'ocultar', tabla: 'edificio', elementoId: 'abc', motivo: 'Es una glorieta' });
    expect(response.status).toBe(201);
    expect(sqlOf(query).some((s) => s.includes('gestion.historial'))).toBe(true);
  });

  it('no permite ocultar dos veces ni elementos que no existen', async () => {
    const twice = setup('registro', (sql) =>
      sql.includes('WHERE id=$1') || sql.includes("accion='ocultar' AND anulada_en IS NULL")
        ? { rows: [{ x: 1 }] }
        : { rows: [] },
    );
    const body = { accion: 'ocultar', tabla: 'lugar', elementoId: 'abc', motivo: 'Cerró' };
    expect((await request(twice.app).post('/correcciones-mapa').send(body)).status).toBe(409);
    const missing = setup('registro', () => ({ rows: [] }));
    expect((await request(missing.app).post('/correcciones-mapa').send(body)).status).toBe(404);
  });

  it('mover un lugar anula su ubicación corregida anterior', async () => {
    const { app, query } = setup('registro', (sql) =>
      sql.includes('WHERE id=$1')
        ? { rows: [{ x: 1 }] }
        : sql.startsWith('INSERT')
          ? { rows: [{ id: correctionId }] }
          : { rows: [] },
    );
    const response = await request(app)
      .post('/correcciones-mapa')
      .send({
        accion: 'mover',
        tabla: 'lugar',
        elementoId: 'abc',
        punto: [-78.5316, -5.639],
        motivo: 'Está en la otra esquina',
      });
    expect(response.status).toBe(201);
    const sql = sqlOf(query);
    expect(sql.findIndex((s) => s.includes("accion='mover' AND anulada_en IS NULL"))).toBeLessThan(
      sql.findIndex((s) => s.startsWith('INSERT INTO bagua_master.correccion')),
    );
  });

  it('rechaza edificaciones que se cruzan o fuera de tamaño', async () => {
    const body = { accion: 'agregar', tabla: 'edificio', anillo: plaza, motivo: 'Casa nueva' };
    const crossed = setup('registro', (sql) =>
      sql.includes('ST_IsValid') ? { rows: [{ valida: false, area: 80 }] } : { rows: [] },
    );
    expect((await request(crossed.app).post('/correcciones-mapa').send(body)).body.code).toBe(
      'INVALID_GEOMETRY',
    );
    const huge = setup('registro', (sql) =>
      sql.includes('ST_IsValid') ? { rows: [{ valida: true, area: 9000 }] } : { rows: [] },
    );
    expect((await request(huge.app).post('/correcciones-mapa').send(body)).status).toBe(400);
  });

  it('anular deja la corrección guardada y exige motivo', async () => {
    const { app, query } = setup('registro', (sql) =>
      sql.startsWith('UPDATE') ? { rows: [{ id: correctionId }] } : { rows: [] },
    );
    expect(
      (await request(app).post(`/correcciones-mapa/${correctionId}/anular`).send({})).status,
    ).toBe(400);
    const done = await request(app)
      .post(`/correcciones-mapa/${correctionId}/anular`)
      .send({ motivo: 'Sí existe' });
    expect(done.status).toBe(204);
    expect(sqlOf(query).some((s) => s.includes('DELETE'))).toBe(false);
  });
});
