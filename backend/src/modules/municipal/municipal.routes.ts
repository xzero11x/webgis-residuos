import { Router } from 'express';
import { z } from 'zod';
import { SECOND_PASS_LAYERS, type MunicipalRepository } from './municipal.repository.js';
import { createTerritorioRouter } from './territorio.routes.js';

// Lot labels are served only for a high-zoom window, never for the whole town.
const MAX_LABEL_SPAN = 0.03;
export const secondPassQuery = z
  .object({
    capa: z.enum(SECOND_PASS_LAYERS),
    bbox: z
      .string()
      .transform((value) => value.split(',').map(Number))
      .pipe(
        z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .refine(([w, s, e, n]) => w < e && s < n, 'bbox debe ser oeste,sur,este,norte'),
      )
      .optional(),
  })
  .refine(
    ({ capa, bbox }) =>
      capa !== 'etiquetas-lote' ||
      (!!bbox && bbox[2] - bbox[0] <= MAX_LABEL_SPAN && bbox[3] - bbox[1] <= MAX_LABEL_SPAN),
    { message: `etiquetas-lote exige un bbox de hasta ${MAX_LABEL_SPAN}°`, path: ['bbox'] },
  );

export function createMunicipalRouter(repository: MunicipalRepository) {
  const router = Router();
  router.get('/cad-inventario', async (_req, res) => res.json(await repository.cadInventory()));
  router.get('/cad-revision', async (req, res) => {
    const source = z.string().min(1).max(200).parse(req.query.archivo);
    const layer = z.string().min(1).max(250).parse(req.query.capa);
    const { bbox } = secondPassQuery.parse({ capa: 'etiquetas-lote', bbox: req.query.bbox });
    res.json(await repository.cadReview(source, layer, bbox!));
  });
  router.get('/cartografia', async (_req, res) => res.json(await repository.cartography()));
  router.get('/resumen', async (_req, res) => res.json(await repository.summary()));
  router.get('/segunda-pasada', async (_req, res) =>
    res.json(await repository.secondPassSummary()),
  );
  router.get('/segunda-pasada/:capa', async (req, res) => {
    const { capa, bbox } = secondPassQuery.parse({ capa: req.params.capa, bbox: req.query.bbox });
    res.json(await repository.secondPass(capa, bbox));
  });
  router.use('/territorio', createTerritorioRouter(repository.territorio));
  router.get('/referencias', async (req, res) => {
    const category = z.enum(['lote_cad', 'anotacion_ruta']).parse(req.query.clase);
    res.json(await repository.references(category));
  });
  return router;
}
