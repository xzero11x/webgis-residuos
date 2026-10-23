import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import type { MunicipalRepository } from './municipal.repository.js';

function app() {
  const secondPass = vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] });
  const repository = { secondPass } as unknown as MunicipalRepository;
  return { secondPass, app: createApp({ checkDatabase: async () => {} }, undefined, repository) };
}

describe('Segunda pasada DWG (solo lectura)', () => {
  it('sirve capas de revisión y transmite el bbox', async () => {
    const { app: server, secondPass } = app();
    const response = await request(server).get(
      '/api/municipal/segunda-pasada/manzanas?bbox=-78.54,-5.64,-78.53,-5.63',
    );
    expect(response.status).toBe(200);
    expect(secondPass).toHaveBeenCalledWith('manzanas', [-78.54, -5.64, -78.53, -5.63]);
  });

  it('exige una ventana pequeña para los rótulos de lote', async () => {
    const { app: server, secondPass } = app();
    for (const query of ['', '?bbox=-78.6,-5.7,-78.5,-5.6', '?bbox=-78.53,-5.64,-78.54,-5.63']) {
      const response = await request(server).get(
        `/api/municipal/segunda-pasada/etiquetas-lote${query}`,
      );
      expect(response.status).toBe(400);
    }
    const ok = await request(server).get(
      '/api/municipal/segunda-pasada/etiquetas-lote?bbox=-78.537,-5.639,-78.534,-5.637',
    );
    expect(ok.status).toBe(200);
    expect(secondPass).toHaveBeenCalledOnce();
  });

  it('rechaza capas desconocidas y no expone escritura', async () => {
    const { app: server } = app();
    expect((await request(server).get('/api/municipal/segunda-pasada/rutas')).status).toBe(400);
    expect((await request(server).post('/api/municipal/segunda-pasada/manzanas')).status).toBe(404);
  });
});
