import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { User } from './gestion.schema.js';

const escape = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

// Búsqueda universal del padrón. Un solo contrato aplica los permisos en el servidor:
// los perfiles de consulta no reciben personas, conteos ni pistas sobre ellas.
export function createSearchRouter(pool: Pool) {
  const router = Router();
  router.get('/busqueda', async (req, res) => {
    const { q } = z
      .object({ q: z.string().trim().min(2).max(100) })
      .strict()
      .parse(req.query);
    const personal = (res.locals.user as User).rol !== 'consulta';
    const like = escape(q);
    const digits = q.replace(/[^0-9a-z]/gi, '');
    const [predios, unidades, personas] = await Promise.all([
      pool.query(
        `SELECT p.id,p.codigo,p.direccion,p.sector,p.uso,p.estado_ubicacion,p.archivado,f.sintetica,
          (SELECT count(*)::int FROM gestion.unidad u WHERE u.predio_id=p.id AND u.activa) AS unidades
         FROM gestion.predio p JOIN gestion.fuente f ON f.id=p.fuente_id
         WHERE (p.codigo ILIKE $1 OR p.direccion ILIKE $1 OR coalesce(p.sector,'') ILIKE $1)
         ORDER BY (lower(p.codigo)=lower($2)) DESC, p.archivado, p.codigo, p.id LIMIT 7`,
        [like, q],
      ),
      pool.query(
        `SELECT u.id,u.codigo,u.nombre,u.tipo,u.predio_id,p.codigo AS predio_codigo,p.direccion
         FROM gestion.unidad u JOIN gestion.predio p ON p.id=u.predio_id
         WHERE u.activa AND NOT p.archivado AND
          (u.codigo ILIKE $1 OR u.nombre ILIKE $1 OR p.codigo ILIKE $1)
         ORDER BY u.codigo,u.id LIMIT 5`,
        [like],
      ),
      personal
        ? pool.query(
            `SELECT x.id,x.codigo,x.nombre,x.tipo,f.sintetica,
              CASE WHEN x.documento IS NULL THEN NULL ELSE repeat('•',greatest(length(x.documento)-3,0)) || right(x.documento,3) END AS documento,
              (SELECT count(DISTINCT pid)::int FROM (
                 SELECT v.predio_id AS pid FROM gestion.vinculo v WHERE v.persona_id=x.id
                 UNION SELECT u.predio_id FROM gestion.relacion_unidad r JOIN gestion.unidad u ON u.id=r.unidad_id WHERE r.persona_id=x.id
               ) t) AS predios
             FROM gestion.persona x JOIN gestion.fuente f ON f.id=x.fuente_id
             WHERE x.nombre ILIKE $1 OR x.codigo ILIKE $1
               OR (length($2)>=4 AND x.documento IS NOT NULL AND regexp_replace(lower(x.documento),'[^0-9a-z]','','g') LIKE '%'||lower($2)||'%')
             ORDER BY (lower(x.nombre)=lower($3)) DESC, x.nombre, x.id LIMIT 6`,
            [like, digits, q],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    res.json({
      q,
      predios: predios.rows,
      unidades: unidades.rows,
      personas: personas.rows,
      personasPermitidas: personal,
    });
  });
  return router;
}
