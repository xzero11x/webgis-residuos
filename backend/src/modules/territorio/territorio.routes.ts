import { Router } from 'express';
import { z } from 'zod';
import type { TerritorioRepository } from './territorio.repository.js';
import { createTerritorioService } from './territorio.service.js';
import { filtersSchema, predioSchema, updatePredioSchema } from './territorio.schema.js';

export function createTerritorioRouter(repository: TerritorioRepository) {
  const router = Router();
  const service = createTerritorioService(repository);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/catalogos', async (_req, res) => {
    res.json(await service.catalogs());
  });
  router.get('/capas', async (req, res) => {
    res.json(await service.layers(filtersSchema.parse(req.query)));
  });
  router.get('/predios', async (req, res) => {
    res.json(await service.list(filtersSchema.parse(req.query)));
  });
  router.get('/predios/:id', async (req, res) => {
    res.json(await service.detail(z.uuid().parse(req.params.id)));
  });
  router.post('/predios', async (req, res) => {
    res.status(201).json(await service.create(predioSchema.parse(req.body)));
  });
  router.put('/predios/:id', async (req, res) => {
    res.json(
      await service.update(z.uuid().parse(req.params.id), updatePredioSchema.parse(req.body)),
    );
  });
  router.delete('/predios/:id', async (req, res) => {
    await service.remove(
      z.uuid().parse(req.params.id),
      z.object({ version: z.number().int().positive() }).strict().parse(req.body).version,
    );
    res.status(204).end();
  });
  return router;
}
