import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';
import { createGestionRouter } from './gestion.routes.js';

const saved = {
  deployment: env.BAGUA_DEPLOYMENT,
  target: env.BAGUA_FIXTURE_DATABASE,
  open: env.BAGUA_ACCESO_LIBRE,
};
afterEach(() => {
  env.BAGUA_DEPLOYMENT = saved.deployment;
  env.BAGUA_FIXTURE_DATABASE = saved.target;
  env.BAGUA_ACCESO_LIBRE = saved.open;
});
function setup() {
  env.BAGUA_DEPLOYMENT = 'production';
  env.BAGUA_FIXTURE_DATABASE = env.PGDATABASE;
  env.BAGUA_ACCESO_LIBRE = 'false';
  const query = vi.fn().mockResolvedValue({
    rows: [{ id: 'fixture-user', nombre: 'Ensayo', usuario: 'ensayo', rol: 'administrador' }],
  });
  const connect = vi.fn();
  const app = express();
  app.use(express.json());
  app.use('/api/gestion', createGestionRouter({ query, connect } as unknown as Pool));
  app.use(
    (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      void _next; // Express identifica el middleware de error por sus cuatro argumentos.
      res
        .status(error instanceof AppError ? error.statusCode : 500)
        .json({ code: error instanceof AppError ? error.code : 'ERROR' });
    },
  );
  return { app, query, connect };
}
const cookie = `bagua_gestion=${'a'.repeat(64)}`;
describe('Contrato sintético bloqueado en producción', () => {
  it.each([
    ['post', '/predios'],
    ['put', '/predios/invalid'],
    ['post', '/personas'],
    ['post', '/predios/invalid/vinculos'],
    ['post', '/predios/invalid/asignaciones'],
    ['post', '/predios/invalid/participaciones'],
    ['post', '/entregas'],
    ['patch', '/entregas/invalid'],
    ['post', '/importaciones/invalid/revertir'],
    ['post', '/entregas/invalid/anular'],
    ['post', '/predios/invalid/vinculos/invalid/cerrar'],
    ['post', '/importaciones/validar'],
    ['post', '/importaciones/invalid/aplicar'],
    ['post', '/importaciones/columnas'],
    ['post', '/catalogos/servicios'],
    ['patch', '/catalogos/servicios/invalid'],
    ['post', '/usuarios'],
    ['patch', '/usuarios/invalid'],
    ['post', '/password'],
    ['post', '/usuarios/invalid/password'],
    ['post', '/predios/invalid/espacial'],
    ['patch', '/predios/invalid/espacial/invalid'],
    ['post', '/predios/invalid/unidades/invalid/relaciones'],
    ['post', '/predios/invalid/unidades/invalid/relaciones/invalid/cerrar'],
  ] as const)(
    'deniega %s %s antes de validar el cuerpo o abrir transacción',
    async (method, path) => {
      const { app, query, connect } = setup();
      const result = await request(app)
        [method](`/api/gestion${path}`)
        .set('Cookie', cookie)
        .set('X-Bagua-Request', '1')
        .send({});
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('FIXTURE_TARGET_BLOCKED');
      expect(connect).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(1); // Solo autorización; no escrituras.
      expect(query.mock.calls[0]![0]).toContain('SELECT u.id');
    },
  );
  it('no publica configuración del destino y exige sesión al consultar la habilitación', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/gestion/entorno')).status).toBe(401);
    const result = await request(app).get('/api/gestion/entorno').set('Cookie', cookie);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ fixturesPermitidos: false, accesoLibre: false });
  });
  it('permite cerrar sesión incluso con las escrituras sintéticas bloqueadas', async () => {
    const { app, query } = setup();
    const result = await request(app)
      .post('/api/gestion/salir')
      .set('Cookie', cookie)
      .set('X-Bagua-Request', '1')
      .send({});
    expect(result.status).toBe(204);
    expect(query.mock.calls[1]![0]).toContain('DELETE FROM gestion.sesion');
  });
});

describe('Acceso libre', () => {
  it('no se admite fuera de un destino local o de pruebas con fixtures', () => {
    env.BAGUA_DEPLOYMENT = 'production';
    env.BAGUA_FIXTURE_DATABASE = env.PGDATABASE;
    env.BAGUA_ACCESO_LIBRE = 'true';
    expect(() => createGestionRouter({ query: vi.fn() } as unknown as Pool)).toThrow(
      /BAGUA_ACCESO_LIBRE/,
    );
  });
});
