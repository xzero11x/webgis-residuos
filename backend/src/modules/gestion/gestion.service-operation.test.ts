import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  createServiceOperationRouter,
  serviceOperationFilter,
} from './gestion.service-operation.js';
describe('Consulta operativa de servicios', () => {
  it('rechaza tablas arbitrarias y páginas inválidas', () => {
    expect(serviceOperationFilter.safeParse({ tipo: 'persona' }).success).toBe(false);
    expect(serviceOperationFilter.safeParse({ page: 0 }).success).toBe(false);
    expect(serviceOperationFilter.safeParse({ page: '2', extra: 'x' }).success).toBe(false);
  });
  it('pagina registros reales sin seleccionar identidades ni observaciones', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'service', nombre: 'Ensayo' }] })
      .mockResolvedValueOnce({ rows: Array.from({ length: 26 }, (_, i) => ({ id: String(i) })) });
    const app = express();
    app.use(createServiceOperationRouter({ query } as unknown as Pool));
    const r = await request(app).get(
      '/servicios/ef933138-a3c8-4038-b5cf-2b03322a0bb2/operacion?tipo=entregas&page=2',
    );
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(25);
    expect(r.body.hayMas).toBe(true);
    expect(query.mock.calls[1]?.[1]).toEqual(['ef933138-a3c8-4038-b5cf-2b03322a0bb2', 25]);
    expect(query.mock.calls[1]?.[0]).not.toMatch(/persona|observaciones|responsable|\*/);
  });
});
