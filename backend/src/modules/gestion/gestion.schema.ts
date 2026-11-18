import { z } from 'zod';

const text = (max = 200) => z.string().trim().min(1).max(max);
const nullable = (max = 200) => z.string().trim().max(max).nullable().default(null);
export const day = z.iso.date();
export const roleSchema = z.enum(['administrador', 'registro', 'consulta']);
export const predioInput = z
  .object({
    codigo: text(60)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((s) => s.toUpperCase()),
    direccion: text(),
    sector: nullable(120),
    uso: nullable(120),
    observaciones: z.string().trim().max(2000).default(''),
    ubicacion: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([
          z.number().finite().min(-180).max(180),
          z.number().finite().min(-90).max(90),
        ]),
      })
      .strict()
      .nullable()
      .default(null),
    estadoUbicacion: z
      .enum(['pendiente', 'aproximada', 'verificada', 'conflictiva'])
      .default('pendiente'),
    evidenciaUbicacion: z.string().trim().max(1000).default(''),
  })
  .strict()
  .superRefine((v, ctx) => {
    const located = ['aproximada', 'verificada'].includes(v.estadoUbicacion);
    if (located !== (v.ubicacion !== null) || (located && !v.evidenciaUbicacion))
      ctx.addIssue({
        code: 'custom',
        path: ['ubicacion'],
        message: 'La ubicación requiere un punto, un estado y evidencia coherentes.',
      });
  });
export const predioUpdate = z
  .object({ datos: predioInput, version: z.number().int().positive() })
  .strict();
export const personInput = z
  .object({ codigo: text(60), nombre: text(160), tipo: z.enum(['natural', 'juridica']) })
  .strict();
export const period = z
  .object({ desde: day, hasta: day.nullable().default(null), evidencia: text(1000) })
  .refine((v) => !v.hasta || v.hasta >= v.desde, {
    message: 'La fecha final no puede ser anterior a la inicial.',
    path: ['hasta'],
  });
export const linkInput = z
  .object({
    personaId: z.uuid().optional(),
    persona: personInput.optional(),
    tipo: z.enum(['contribuyente', 'ocupante', 'propietario_declarado', 'responsable', 'otro']),
    periodo: period,
  })
  .strict()
  .refine((v) => Boolean(v.personaId) !== Boolean(v.persona), {
    message: 'Indica una persona existente o una persona nueva.',
  });
export const serviceInput = z
  .object({
    servicioId: z.uuid(),
    estado: z.enum(['prevista', 'pendiente', 'confirmada']).default('pendiente'),
    periodo: period,
  })
  .strict();
export const participationInput = z.object({ servicioId: z.uuid(), periodo: period }).strict();
export const deliveryInput = z
  .object({
    participacionId: z.uuid(),
    fecha: day,
    material: text(120),
    cantidad: z.number().finite().positive().max(1_000_000).nullable().default(null),
    unidad: z.enum(['kg', 'unidad']).nullable().default(null),
    observaciones: z.string().trim().max(1000).default(''),
    clave: z.uuid(),
  })
  .strict()
  .refine((v) => (v.cantidad === null) === (v.unidad === null), {
    message: 'Indica cantidad y unidad juntas, o deja ambas sin información.',
    path: ['cantidad'],
  });
export const filterInput = z
  .object({
    q: z.string().trim().max(120).default(''),
    ubicacion: z.enum(['pendiente', 'aproximada', 'verificada', 'conflictiva']).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    archivo: z.enum(['activos', 'archivados', 'todos']).default('activos'),
  })
  .strict();
export const reportInput = z
  .object({
    desde: day,
    hasta: day,
    sector: z.string().trim().max(120).default(''),
    material: z.string().trim().max(120).default(''),
    servicio: z.union([z.uuid(), z.literal('')]).default(''),
  })
  .strict()
  .refine((v) => v.desde <= v.hasta, { message: 'Periodo inválido.' });
export type PredioInput = z.infer<typeof predioInput>;
export type User = { id: string; nombre: string; usuario: string; rol: z.infer<typeof roleSchema> };
