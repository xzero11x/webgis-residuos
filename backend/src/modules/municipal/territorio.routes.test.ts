import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import type { MunicipalRepository } from './municipal.repository.js';

const ID = '3f2a1c9e-0b7d-5e8f-9a41-6c2d8e7f0a12';

function setup(overrides: Record<string, unknown> = {}) {
  const territorio = {
    summary: vi.fn().mockResolvedValue({ counts: [] }),
    entitiesInBbox: vi
      .fn()
      .mockResolvedValue({ type: 'FeatureCollection', truncated: false, features: [] }),
    entity: vi.fn().mockResolvedValue({ id: ID, kind: 'manzana', atributos: [] }),
    representationsOf: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    ...overrides,
  };
  const repository = { territorio } as unknown as MunicipalRepository;
  return { territorio, app: createApp({ checkDatabase: async () => {} }, undefined, repository) };
}

const BBOX = 'bbox=-78.54,-5.64,-78.53,-5.63';

describe('Territorio unificado (solo lectura)', () => {
  it('exige clase y ventana de consulta', async () => {
    const { app, territorio } = setup();
    expect((await request(app).get(`/api/municipal/territorio/entidades?${BBOX}`)).status).toBe(
      400,
    );
    expect(
      (await request(app).get('/api/municipal/territorio/entidades?clase=manzana')).status,
    ).toBe(400);
    expect(
      (await request(app).get(`/api/municipal/territorio/entidades?clase=todo&${BBOX}`)).status,
    ).toBe(400);
    expect(territorio.entitiesInBbox).not.toHaveBeenCalled();
  });

  it('rechaza ventanas mayores de 0,2 grados por lado', async () => {
    const { app } = setup();
    const response = await request(app).get(
      '/api/municipal/territorio/entidades?clase=lote&bbox=-78.7,-5.8,-78.4,-5.6',
    );
    expect(response.status).toBe(400);
  });

  it('pasa clases y ventana al repositorio', async () => {
    const { app, territorio } = setup();
    const response = await request(app).get(
      `/api/municipal/territorio/entidades?clase=manzana,lote&${BBOX}`,
    );
    expect(response.status).toBe(200);
    expect(territorio.entitiesInBbox).toHaveBeenCalledWith(
      ['manzana', 'lote'],
      [-78.54, -5.64, -78.53, -5.63],
    );
  });

  it('valida el identificador de la ficha y devuelve 404 si no existe', async () => {
    const missing = setup({ entity: vi.fn().mockResolvedValue(null) });
    expect(
      (await request(missing.app).get('/api/municipal/territorio/entidades/no-es-uuid')).status,
    ).toBe(400);
    expect(
      (await request(missing.app).get(`/api/municipal/territorio/entidades/${ID}`)).status,
    ).toBe(404);
  });

  it('la ficha no expone coordenadas brutas ni campos de archivo privado', async () => {
    const payload = {
      id: ID,
      representaciones: [
        { key: 'x', fuente: 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', desviacionM: 0 },
      ],
      atributos: [{ clave: 'rotulo', valor: 'P-13', fuente: { tipo: 'segunda-pasada' } }],
    };
    const { app } = setup({ entity: vi.fn().mockResolvedValue(payload) });
    const response = await request(app).get(`/api/municipal/territorio/entidades/${ID}`);
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('coordenadasBrutas');
    expect(response.text).not.toContain('utm_bruto');
    expect(response.text).not.toMatch(/C:\\|\/home\//);
  });

  it('el resumen es de solo lectura', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/municipal/territorio/resumen')).status).toBe(200);
    expect((await request(app).post('/api/municipal/territorio/entidades')).status).toBe(404);
    expect((await request(app).delete(`/api/municipal/territorio/entidades/${ID}`)).status).toBe(
      404,
    );
  });
});
