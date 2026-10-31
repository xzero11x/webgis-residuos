import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { BAGUA_MASTER_TABLES, type BaguaMasterRepository } from './bagua-master.repository.js';

// Archivos publicables: solo estos nombres, nunca rutas arbitrarias.
const TILE_FILE = /^bagua-master\.pmtiles$/;
const FONTS = new Set(['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']);
const GLYPH_RANGE = /^(\d{1,5})-(\d{1,5})\.pbf$/;

/**
 * Envía un archivo con soporte de solicitudes parciales (Range), necesario para PMTiles:
 * el cliente pide la cabecera y luego solo los bytes de las teselas visibles.
 */
async function sendFile(
  res: Response,
  file: string,
  contentType: string,
  range: string | undefined,
) {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new AppError(404, 'NOT_FOUND', 'Recurso cartográfico no disponible.');
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('ETag', `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`);
  if (!range) {
    res.setHeader('Content-Length', info.size);
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (match[1] === '' && match[2] === '')) {
    res.status(416).setHeader('Content-Range', `bytes */${info.size}`).end();
    return;
  }
  let start: number;
  let end: number;
  if (match[1] === '') {
    // Sufijo: los últimos N bytes.
    const suffix = Number(match[2]);
    start = Math.max(0, info.size - suffix);
    end = info.size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? info.size - 1 : Math.min(Number(match[2]), info.size - 1);
  }
  if (start > end || start >= info.size) {
    res.status(416).setHeader('Content-Range', `bytes */${info.size}`).end();
    return;
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
  res.setHeader('Content-Length', end - start + 1);
  createReadStream(file, { start, end })
    .on('error', () => res.destroy())
    .pipe(res);
}

export function createBaguaMasterRouter(repository: BaguaMasterRepository, dataDir: string) {
  const router = Router();
  const tilesDir = path.join(dataDir, 'teselas');
  const fontsDir = path.join(dataDir, 'estilo', 'fuentes');

  router.get('/alturas/mapa', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(await repository.heightMap());
  });

  router.get('/resumen', async (_req, res) => res.json(await repository.summary()));

  router.get('/elementos/:tabla/:id', async (req, res) => {
    const tabla = z.enum(BAGUA_MASTER_TABLES).parse(req.params.tabla);
    const id = z
      .string()
      .min(1)
      .max(64)
      .regex(/^[0-9a-zA-Z@:._-]+$/)
      .parse(req.params.id);
    const element = await repository.element(tabla, id);
    if (!element) throw new AppError(404, 'NOT_FOUND', 'Elemento no encontrado en BAGUA MASTER.');
    res.json(element);
  });

  router.get('/rutas', async (_req, res) => res.json(await repository.routes()));
  router.get('/rutas/mapa', async (_req, res) => res.json(await repository.routeMap()));

  router.get('/buscar', async (req, res) => {
    const q = z.string().trim().min(2).max(60).parse(req.query.q);
    res.json(await repository.search(q));
  });

  router.get('/teselas/:archivo', async (req, res) => {
    if (!TILE_FILE.test(req.params.archivo))
      throw new AppError(404, 'NOT_FOUND', 'Teselas no disponibles.');
    await sendFile(
      res,
      path.join(tilesDir, req.params.archivo),
      'application/vnd.pmtiles',
      req.headers.range,
    );
  });

  router.get('/fuentes/:fuente/:rango', async (req, res) => {
    const match = GLYPH_RANGE.exec(req.params.rango);
    if (!FONTS.has(req.params.fuente) || !match)
      throw new AppError(404, 'NOT_FOUND', 'Glifo no disponible.');
    await sendFile(
      res,
      path.join(fontsDir, req.params.fuente, req.params.rango),
      'application/x-protobuf',
      undefined,
    );
  });

  return router;
}
