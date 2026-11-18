import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import {
  deliveryCorrection,
  createDeliveryCorrectionsRouter,
} from './gestion.delivery-corrections.js';
import { AppError } from '../../shared/app-error.js';
const id = 'af933138-a3c8-4038-b5cf-2b03322a0bb2';
const correction = {
  version: 1,
  motivo: 'Error de transcripción documentado',
  fecha: '2026-01-20',
  material: 'Material sintético',
  cantidad: null,
  unidad: null,
  observaciones: '',
};
function setup(rol: string) {
  const query = vi
    .fn()
    .mockResolvedValue({ rows: [{ id, version: 2, anulada: false, predio_id: id }] });
  const connect = vi.fn().mockResolvedValue({ query, release: vi.fn() });
  const app = express();
  app.use(express.json());
  app.use((_q, res, next) => {
    res.locals.user = { id, rol };
    next();
  });
  app.use(createDeliveryCorrectionsRouter({ query, connect } as unknown as Pool));
  app.use((e: Error, _q: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    res
      .status(e instanceof AppError ? e.statusCode : 400)
      .json({ code: e instanceof AppError ? e.code : 'VALIDATION' });
  });
  return { app, query, connect };
}
describe('Corrección versionada de entregas', () => {
  it('requiere motivo, versión e identidad inmutable', () => {
    expect(deliveryCorrection.safeParse({ ...correction, motivo: 'x' }).success).toBe(false);
    expect(deliveryCorrection.safeParse({ ...correction, version: 0 }).success).toBe(false);
    expect(deliveryCorrection.safeParse({ ...correction, participacionId: id }).success).toBe(
      false,
    );
  });
  it('mantiene medición nula distinta de cero y valida unidad', () => {
    expect(deliveryCorrection.safeParse(correction).success).toBe(true);
    expect(deliveryCorrection.safeParse({ ...correction, cantidad: 0, unidad: 'kg' }).success).toBe(
      false,
    );
    expect(deliveryCorrection.safeParse({ ...correction, cantidad: 1, unidad: null }).success).toBe(
      false,
    );
  });
  it('deniega lectura y corrección al perfil consulta antes de consultar datos', async () => {
    const { app, query, connect } = setup('consulta');
    expect(
      (
        await request(app)
          .patch('/entregas/' + id)
          .send(correction)
      ).status,
    ).toBe(403);
    expect((await request(app).get('/entregas/' + id + '/revisiones')).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
  it('rechaza revisión obsoleta y revierte transacción sin escribir', async () => {
    const { app, query } = setup('registro');
    const r = await request(app)
      .patch('/entregas/' + id)
      .send(correction);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('VERSION_CONFLICT');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query.mock.calls.some((args) => String(args[0]).startsWith('UPDATE'))).toBe(false);
  });
});
