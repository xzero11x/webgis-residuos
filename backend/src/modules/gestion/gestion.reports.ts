import type { Pool } from 'pg';
import { z } from 'zod';
import { reportInput } from './gestion.schema.js';

export async function reportRows(pool: Pool, filter: z.infer<typeof reportInput>) {
  return (
    await pool.query(
      `SELECT s.nombre AS servicio,e.material,e.unidad,count(*)::int AS entregas,
      count(*) FILTER(WHERE e.cantidad IS NULL)::int AS sin_medicion,sum(e.cantidad)::text AS cantidad
      FROM gestion.entrega e JOIN gestion.participacion p ON p.id=e.participacion_id
      JOIN gestion.servicio s ON s.id=p.servicio_id JOIN gestion.predio pr ON pr.id=p.predio_id
      WHERE NOT e.anulada AND e.fecha BETWEEN $1 AND $2
      AND ($3='' OR pr.sector=$3) AND ($4='' OR e.material=$4) AND ($5::text='' OR s.id::text=$5)
      GROUP BY s.nombre,e.material,e.unidad ORDER BY s.nombre,e.material,e.unidad`,
      [filter.desde, filter.hasta, filter.sector, filter.material, filter.servicio],
    )
  ).rows;
}
