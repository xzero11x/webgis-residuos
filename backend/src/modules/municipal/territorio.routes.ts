import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { TERRITORIO_KINDS, type Bbox, type TerritorioRepository } from './territorio.repository.js';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Ventana de consulta obligatoria: nunca se devuelve la capa completa.
const entitiesQuery = z.object({
  clase: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((item) => item.trim()))
    .pipe(z.array(z.enum(TERRITORIO_KINDS)).min(1).max(TERRITORIO_KINDS.length)),
  bbox: z
    .string()
    .transform((value) => value.split(',').map(Number))
    .pipe(
      z
        .tuple([z.number(), z.number(), z.number(), z.number()])
        .refine(
          ([w, s, e, n]) => w < e && s < n && e - w <= 0.2 && n - s <= 0.2,
          'bbox de hasta 0,2° por lado',
        ),
    ),
});

export function createTerritorioRouter(repository: TerritorioRepository) {
  const router = Router();
  router.get('/resumen', async (_req, res) => res.json(await repository.summary()));
  router.get('/entidades', async (req, res) => {
    const { clase, bbox } = entitiesQuery.parse({ clase: req.query.clase, bbox: req.query.bbox });
    res.json(await repository.entitiesInBbox(clase, bbox as Bbox));
  });
  router.get('/entidades/:id', async (req, res) => {
    if (!idPattern.test(req.params.id))
      throw new AppError(400, 'VALIDATION_ERROR', 'Identificador no válido.');
    const entity = await repository.entity(req.params.id);
    if (!entity) throw new AppError(404, 'NOT_FOUND', 'Entidad territorial no encontrada.');
    res.json(entity);
  });
  router.get('/entidades/:id/representaciones', async (req, res) => {
    if (!idPattern.test(req.params.id))
      throw new AppError(400, 'VALIDATION_ERROR', 'Identificador no válido.');
    res.json(await repository.representationsOf(req.params.id));
  });
  return router;
}
