import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.js';
import { errorHandler } from './error-handler.js';

const makeTestApp = () => {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post(
    '/validation-test',
    validate(z.object({ count: z.coerce.number().int().positive() })),
    (_req, res) => res.json(res.locals.validated),
  );
  app.get('/error-test', () => {
    throw new Error('internal secret');
  });
  app.use(errorHandler);
  return app;
};

describe('Validación y errores', () => {
  it('entrega al controlador los valores transformados por Zod', async () => {
    const response = await request(makeTestApp()).post('/validation-test').send({ count: '3' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 3 });
  });
  it('rechaza datos inválidos con 400', async () => {
    const response = await request(makeTestApp()).post('/validation-test').send({ count: -2 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('trata JSON malformado como error de cliente', async () => {
    const response = await request(makeTestApp())
      .post('/validation-test')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
  it('limita el tamaño de entrada', async () => {
    const response = await request(makeTestApp())
      .post('/validation-test')
      .send({ data: 'x'.repeat(2000) });
    expect(response.status).toBe(413);
  });
  it('oculta detalles internos en respuestas 500', async () => {
    const response = await request(makeTestApp()).get('/error-test');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('internal secret');
  });
});
