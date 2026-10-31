import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import type { BaguaMasterRepository } from './bagua-master.repository.js';

const health = { checkDatabase: async () => {} };

// Respuesta binaria completa (supertest no decodifica tipos desconocidos).
function binary(res: unknown, done: (err: Error | null, body: Buffer) => void) {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
}

function dataDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bagua-master-'));
  mkdirSync(path.join(dir, 'teselas'));
  mkdirSync(path.join(dir, 'estilo', 'fuentes', 'Noto Sans Regular'), { recursive: true });
  writeFileSync(
    path.join(dir, 'teselas', 'bagua-master.pmtiles'),
    Buffer.from('PMTiles0123456789'),
  );
  writeFileSync(
    path.join(dir, 'estilo', 'fuentes', 'Noto Sans Regular', '0-255.pbf'),
    Buffer.from('glyph'),
  );
  return dir;
}

function setup(overrides: Partial<Record<keyof BaguaMasterRepository, unknown>> = {}) {
  const repository = {
    heightMap: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    summary: vi.fn().mockResolvedValue({ modulo: 'BAGUA MASTER' }),
    element: vi.fn().mockResolvedValue({ id: 'a', tabla: 'edificio' }),
    search: vi.fn().mockResolvedValue([]),
    routes: vi.fn().mockResolvedValue({ aviso: 'documental', rutas: [{ codigo: 'MUN-1001' }] }),
    routeMap: vi.fn().mockResolvedValue({
      trazos: { type: 'FeatureCollection', features: [] },
      flechas: { type: 'FeatureCollection', features: [] },
      marcadores: { type: 'FeatureCollection', features: [] },
    }),
    ...overrides,
  } as unknown as BaguaMasterRepository;
  return {
    repository,
    app: createApp(health, undefined, undefined, { repository, dataDir: dataDir() }),
  };
}

describe('BAGUA MASTER (módulo independiente)', () => {
  it('expone las alturas derivadas de solo lectura con caché acotada', async () => {
    const { app, repository } = setup();
    const response = await request(app).get('/api/bagua-master/alturas/mapa');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: 'FeatureCollection', features: [] });
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(repository.heightMap).toHaveBeenCalledOnce();
    expect((await request(app).post('/api/bagua-master/alturas/mapa')).status).toBe(404);
  });

  it('sirve PMTiles completas y por rangos HTTP', async () => {
    const { app } = setup();
    const full = await request(app).get('/api/bagua-master/teselas/bagua-master.pmtiles');
    expect(full.status).toBe(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    const partial = await request(app)
      .get('/api/bagua-master/teselas/bagua-master.pmtiles')
      .set('Range', 'bytes=0-6')
      .buffer(true)
      .parse(binary);
    expect(partial.status).toBe(206);
    expect(partial.headers['content-range']).toBe('bytes 0-6/17');
    expect((partial.body as Buffer).toString()).toBe('PMTiles');
    const suffix = await request(app)
      .get('/api/bagua-master/teselas/bagua-master.pmtiles')
      .set('Range', 'bytes=-4');
    expect(suffix.status).toBe(206);
    expect(suffix.headers['content-range']).toBe('bytes 13-16/17');
    const outside = await request(app)
      .get('/api/bagua-master/teselas/bagua-master.pmtiles')
      .set('Range', 'bytes=100-200');
    expect(outside.status).toBe(416);
  });

  it('solo publica los archivos previstos', async () => {
    const { app } = setup();
    for (const url of [
      '/api/bagua-master/teselas/otro.pmtiles',
      '/api/bagua-master/teselas/..%2F..%2Fpackage.json',
      '/api/bagua-master/fuentes/Arial/0-255.pbf',
      '/api/bagua-master/fuentes/Noto%20Sans%20Regular/..%2Fsecreto',
    ])
      expect((await request(app).get(url)).status).toBe(404);
    const glyph = await request(app).get(
      '/api/bagua-master/fuentes/Noto%20Sans%20Regular/0-255.pbf',
    );
    expect(glyph.status).toBe(200);
  });

  it('valida tabla, identificador y búsqueda', async () => {
    const { app, repository } = setup();
    expect((await request(app).get('/api/bagua-master/elementos/rutas/x')).status).toBe(400);
    expect((await request(app).get('/api/bagua-master/elementos/edificio/a%20b')).status).toBe(400);
    expect((await request(app).get('/api/bagua-master/buscar?q=a')).status).toBe(400);
    expect((await request(app).get('/api/bagua-master/elementos/edificio/abc-1')).status).toBe(200);
    expect(repository.element).toHaveBeenCalledWith('edificio', 'abc-1');
    const missing = setup({ element: vi.fn().mockResolvedValue(null) });
    expect((await request(missing.app).get('/api/bagua-master/elementos/lugar/x1')).status).toBe(
      404,
    );
  });

  it('expone las rutas municipales documentadas en solo lectura', async () => {
    const { app, repository } = setup();
    const list = await request(app).get('/api/bagua-master/rutas');
    expect(list.status).toBe(200);
    expect(list.body.rutas[0].codigo).toBe('MUN-1001');
    const map = await request(app).get('/api/bagua-master/rutas/mapa');
    expect(map.status).toBe(200);
    expect(Object.keys(map.body)).toEqual(['trazos', 'flechas', 'marcadores']);
    expect(repository.routes).toHaveBeenCalledOnce();
    expect((await request(app).post('/api/bagua-master/rutas')).status).toBe(404);
  });

  it('desactivado no expone rutas y no altera la API municipal', async () => {
    const app = createApp(health);
    expect((await request(app).get('/api/bagua-master/resumen')).status).toBe(404);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('es de solo lectura', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/bagua-master/elementos/edificio/a')).status).toBe(404);
    expect(
      (await request(app).delete('/api/bagua-master/teselas/bagua-master.pmtiles')).status,
    ).toBe(404);
  });
});
