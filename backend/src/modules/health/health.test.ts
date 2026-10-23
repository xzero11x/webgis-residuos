import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

describe('Infraestructura HTTP', () => {
  it('responde a /api/health y /health sin depender de PostgreSQL', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('offline'));
    const app = createApp({ checkDatabase });
    for (const path of ['/api/health', '/health']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'ok', service: 'bagua-webgis-api' });
      expect(response.headers['x-request-id']).toBeTruthy();
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it('informa disponibilidad solo después de verificar PostGIS', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const response = await request(createApp({ checkDatabase })).get('/api/ready');
    expect(checkDatabase).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'ok', postgis: 'ok' });
  });

  it('devuelve 503 sin filtrar detalles de conexión si PostgreSQL falla', async () => {
    const app = createApp({
      checkDatabase: async () => {
        throw new Error('sensitive-db-host password=secret');
      },
    });
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unavailable');
    expect(response.text).not.toContain('secret');
    expect(response.text).not.toContain('sensitive-db-host');
  });

  it('documenta los estados de salud y sirve Swagger', async () => {
    const app = createApp({ checkDatabase: async () => {} });
    const document = await request(app).get('/api/openapi.json');
    expect(document.status).toBe(200);
    expect(document.body.paths['/ready'].get.responses['503']).toBeDefined();
    const swagger = await request(app).get('/api/docs/');
    expect(swagger.status).toBe(200);
    expect(swagger.text).toContain('swagger-ui');
  });

  it('responde con error JSON a rutas inexistentes', async () => {
    const response = await request(createApp({ checkDatabase: async () => {} })).get(
      '/api/missing',
    );
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
  });
});
