import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createAuditRouter, auditFilter } from './gestion.audit.js';
import { AppError } from '../../shared/app-error.js';

function setup(role: string) {
  const query = vi.fn().mockResolvedValue({
    rows: [
      { id: '30', accion: 'predio.creado' },
      { id: '29', accion: 'predio.creado' },
    ],
  });
  const app = express();
  app.use((_req, res, next) => {
    res.locals.user = { rol: role };
    next();
  });
  app.use(createAuditRouter({ query } as unknown as Pool));
  app.use((e: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    res.status(e instanceof AppError ? e.statusCode : 400).json({ error: 'Solicitud rechazada' });
  });
  return { app, query };
}
describe('Auditoría global', () => {
  it.each(['consulta', 'registro'])('deniega %s antes de consultar snapshots', async (role) => {
    const { app, query } = setup(role);
    expect((await request(app).get('/auditoria')).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it('pagina por identidad estable y proyecta solo metadata', async () => {
    const { app, query } = setup('administrador');
    const response = await request(app).get('/auditoria?limite=1&antes=40&accion=predio.creado');
    expect(response.status).toBe(200);
    expect(response.body.siguiente).toBe('30');
    expect(response.body.items).toHaveLength(1);
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).not.toMatch(/anterior|nuevo/);
    expect(values).toEqual(['40', 'predio.creado', null, 2]);
  });
  it('rechaza cursores, límites, referencias y campos no permitidos', () => {
    for (const data of [
      { antes: '-1' },
      { antes: '9999999999999999999' },
      { antes: '1 OR 1=1' },
      { limite: 101 },
      { predio: 'abc' },
      { snapshots: true },
    ])
      expect(auditFilter.safeParse(data).success).toBe(false);
  });
});
