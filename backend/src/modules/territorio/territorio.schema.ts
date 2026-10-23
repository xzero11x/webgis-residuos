import { z } from 'zod';

// Provisional urban working extent, not an official administrative boundary.
export const BAGUA_BOUNDS = [-78.552, -5.662, -78.512, -5.616] as const;
const position = z.tuple([
  z.number().finite().min(BAGUA_BOUNDS[0]).max(BAGUA_BOUNDS[2]),
  z.number().finite().min(BAGUA_BOUNDS[1]).max(BAGUA_BOUNDS[3]),
]);
const ring = z
  .array(position)
  .min(4)
  .max(250)
  .refine((points) => {
    const first = points[0];
    const last = points.at(-1);
    return first?.[0] === last?.[0] && first?.[1] === last?.[1];
  }, 'El polígono debe estar cerrado.');
export const polygonSchema = z
  .object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(10) })
  .strict();
export const personSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120),
    vinculo: z.enum(['Propietario', 'Ocupante', 'Responsable', 'Contribuyente', 'Otro']),
  })
  .strict();
export const assignmentSchema = z
  .object({ servicioId: z.uuid(), rutaId: z.uuid().nullable() })
  .strict();
export const predioSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9-]+$/, 'Usa letras, números y guiones.'),
    direccion: z.string().trim().min(3).max(200),
    sectorId: z.uuid(),
    observaciones: z.string().trim().max(1000).default(''),
    geometry: polygonSchema,
    personas: z.array(personSchema).max(10).default([]),
    servicios: z
      .array(assignmentSchema)
      .max(10)
      .refine(
        (items) => new Set(items.map((item) => item.servicioId)).size === items.length,
        'No repitas un servicio.',
      )
      .default([]),
  })
  .strict();
export const updatePredioSchema = predioSchema.extend({ version: z.number().int().positive() });
export const filtersSchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    servicio: z.uuid().optional(),
    ruta: z.uuid().optional(),
    sector: z.uuid().optional(),
  })
  .strict();
export type PredioInput = z.infer<typeof predioSchema>;
export type PredioUpdate = z.infer<typeof updatePredioSchema>;
export type Filters = z.infer<typeof filtersSchema>;
