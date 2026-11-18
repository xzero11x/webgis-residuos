import { z } from 'zod';
export const importFields = [
  'direccion',
  'sector',
  'uso',
  'observaciones',
  'ubicacion',
  'estadoUbicacion',
  'evidenciaUbicacion',
] as const;
export const resolutionsInput = z
  .object({
    resoluciones: z
      .array(
        z
          .object({
            codigo: z.string().min(1).max(60),
            accion: z.enum(['conservar', 'actualizar']),
            version: z.number().int().positive(),
            campos: z.array(z.enum(importFields)).max(7).default([]),
          })
          .strict(),
      )
      .max(500)
      .default([]),
  })
  .strict();
export function administrativeInput(row: Record<string, unknown>) {
  return {
    codigo: row.codigo,
    direccion: row.direccion,
    sector: row.sector,
    uso: row.uso,
    observaciones: row.observaciones,
    ubicacion: row.ubicacion,
    estadoUbicacion: row.estado_ubicacion,
    evidenciaUbicacion: row.evidencia_ubicacion,
  };
}
