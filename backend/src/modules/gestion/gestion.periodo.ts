import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../shared/app-error.js';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «2026-10» → «octubre de 2026». */
export const monthName = (iso: string) =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

/** Un mes cerrado no admite registros ni correcciones con fecha dentro de él. */
export async function assertOpenPeriod(c: Pool | PoolClient, fecha: string) {
  const closed = await c.query(
    `SELECT 1 FROM gestion.periodo_cierre
     WHERE periodo=date_trunc('month',$1::date)::date AND reabierto_en IS NULL`,
    [fecha],
  );
  if (closed.rowCount)
    throw new AppError(
      409,
      'PERIOD_CLOSED',
      `El mes de ${monthName(fecha)} está cerrado. Pide a administración que lo reabra para corregirlo.`,
    );
}
