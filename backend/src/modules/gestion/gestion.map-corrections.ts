import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { audit, transaction } from './gestion.repository.js';
import type { User } from './gestion.schema.js';

// Correcciones cartográficas locales de BAGUA MASTER: quien conoce Bagua marca un lugar o una
// edificación que no existe, mueve un lugar mal ubicado o dibuja una edificación que falta. Se
// guardan en bagua_master.correccion y el mapa las aplica encima de Overture y de la capa
// complementaria, sin modificarlas. No son datos del padrón: no exigen destino de fixtures.

// Ventana de descarga de BAGUA MASTER (scripts/bagua-master/ambito.json).
const BBOX = { oeste: -78.585, sur: -5.7, este: -78.48, norte: -5.59 } as const;
const lonLat = z.tuple([
  z.number().min(BBOX.oeste).max(BBOX.este),
  z.number().min(BBOX.sur).max(BBOX.norte),
]);
const elementId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9a-zA-Z@:._-]+$/);
const motivo = z.string().trim().min(3).max(500);

export const mapCorrectionInput = z.discriminatedUnion('accion', [
  z
    .object({
      accion: z.literal('ocultar'),
      tabla: z.enum(['lugar', 'edificio', 'edificio_complemento']),
      elementoId: elementId,
      motivo,
    })
    .strict(),
  z
    .object({
      accion: z.literal('mover'),
      tabla: z.literal('lugar'),
      elementoId: elementId,
      punto: lonLat,
      motivo,
    })
    .strict(),
  z
    .object({
      accion: z.literal('agregar'),
      tabla: z.literal('edificio'),
      anillo: z.array(lonLat).min(3).max(80),
      nombre: z.string().trim().min(1).max(120).optional(),
      motivo,
    })
    .strict(),
]);
export const mapCorrectionAnnul = z.object({ motivo }).strict();

const TABLES = {
  lugar: 'bagua_master.lugar',
  edificio: 'bagua_master.edificio',
  edificio_complemento: 'bagua_master.edificio_complemento',
} as const;
const AREA_M2 = { min: 6, max: 5000 } as const;

export function createMapCorrectionsRouter(pool: Pool, write: RequestHandler) {
  const router = Router();

  router.get('/correcciones-mapa', async (_req, res) => {
    const result = await pool.query(
      `SELECT c.id,c.tabla,c.elemento_id AS "elementoId",c.accion,c.nombre,c.motivo,
              c.creado_en AS "creadoEn",u.nombre AS autor,
              coalesce(l.nombre,e.nombre) AS "nombreElemento",
              ST_AsGeoJSON(ST_PointOnSurface(coalesce(c.geom,l.geom,e.geom,k.geom)),7)::json AS punto
       FROM bagua_master.correccion c
       JOIN gestion.usuario u ON u.id=c.usuario_id
       LEFT JOIN bagua_master.lugar l ON c.tabla='lugar' AND l.id=c.elemento_id
       LEFT JOIN bagua_master.edificio e ON c.tabla='edificio' AND e.id=c.elemento_id
       LEFT JOIN bagua_master.edificio_complemento k
         ON c.tabla='edificio_complemento' AND k.id=c.elemento_id
       WHERE c.anulada_en IS NULL ORDER BY c.creado_en DESC LIMIT 500`,
    );
    res.json({ correcciones: result.rows });
  });

  router.post('/correcciones-mapa', write, async (req, res) => {
    const data = mapCorrectionInput.parse(req.body);
    const user = res.locals.user as User;
    const created = await transaction(pool, async (c) => {
      let geometry: string | null = null;
      if (data.accion === 'agregar') {
        const ring = [...data.anillo];
        const [first, last] = [ring[0]!, ring[ring.length - 1]!];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
        geometry = JSON.stringify({ type: 'Polygon', coordinates: [ring] });
        const check = await c.query(
          `SELECT ST_IsValid(g) AS valida, ST_Area(ST_Transform(g,32717)) AS area
           FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS g) s`,
          [geometry],
        );
        const { valida, area } = check.rows[0] as { valida: boolean; area: number };
        if (!valida)
          throw new AppError(400, 'INVALID_GEOMETRY', 'La forma dibujada se cruza consigo misma.');
        if (area < AREA_M2.min || area > AREA_M2.max)
          throw new AppError(
            400,
            'INVALID_GEOMETRY',
            `Una edificación debe medir entre ${AREA_M2.min} y ${AREA_M2.max} m².`,
          );
      } else {
        const exists = await c.query(`SELECT 1 FROM ${TABLES[data.tabla]} WHERE id=$1`, [
          data.elementoId,
        ]);
        if (!exists.rowCount)
          throw new AppError(404, 'NOT_FOUND', 'Elemento no encontrado en el mapa.');
        if (data.accion === 'mover') {
          geometry = JSON.stringify({ type: 'Point', coordinates: data.punto });
          // Mover de nuevo sustituye la ubicación anterior (queda anulada, no borrada).
          await c.query(
            `UPDATE bagua_master.correccion SET anulada_en=now(),anulada_por=$2
             WHERE tabla='lugar' AND elemento_id=$1 AND accion='mover' AND anulada_en IS NULL`,
            [data.elementoId, user.id],
          );
        } else {
          const active = await c.query(
            `SELECT 1 FROM bagua_master.correccion
             WHERE tabla=$1 AND elemento_id=$2 AND accion='ocultar' AND anulada_en IS NULL`,
            [data.tabla, data.elementoId],
          );
          if (active.rowCount)
            throw new AppError(409, 'DUPLICATE', 'Este elemento ya está marcado como inexistente.');
        }
      }
      const row = (
        await c.query(
          `INSERT INTO bagua_master.correccion(tabla,elemento_id,accion,geom,nombre,motivo,usuario_id)
           VALUES($1,$2,$3,CASE WHEN $4::text IS NULL THEN NULL
                               ELSE ST_SetSRID(ST_GeomFromGeoJSON($4),4326) END,$5,$6,$7)
           RETURNING id,tabla,elemento_id AS "elementoId",accion,nombre,motivo,creado_en AS "creadoEn"`,
          [
            data.tabla,
            data.accion === 'agregar' ? null : data.elementoId,
            data.accion,
            geometry,
            data.accion === 'agregar' ? (data.nombre ?? null) : null,
            data.motivo,
            user.id,
          ],
        )
      ).rows[0];
      await audit(c, user, null, 'correccion_mapa', null, row);
      return row;
    });
    res.status(201).json(created);
  });

  router.post('/correcciones-mapa/:id/anular', write, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { motivo: reason } = mapCorrectionAnnul.parse(req.body);
    const user = res.locals.user as User;
    await transaction(pool, async (c) => {
      const row = (
        await c.query(
          `UPDATE bagua_master.correccion SET anulada_en=now(),anulada_por=$2
           WHERE id=$1 AND anulada_en IS NULL
           RETURNING id,tabla,elemento_id AS "elementoId",accion`,
          [id, user.id],
        )
      ).rows[0];
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Corrección no encontrada o ya anulada.');
      await audit(c, user, null, 'anular_correccion_mapa', row, { motivo: reason });
    });
    res.status(204).end();
  });

  return router;
}
