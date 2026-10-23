import { z } from 'zod';

const mapStyle = z.union([
  z.literal(''),
  z.url().refine((value) => /^https?:\/\//.test(value), 'Usa una URL HTTP(S).'),
]);
export const frontendEnvSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .regex(/^\/(?!\/)[^?#\s]*$/, 'Usa una ruta del mismo origen.')
    .default('/api'),
  VITE_MAP_STYLE_URL: mapStyle.default(''),
  // Módulos cartográficos independientes: cada uno se puede ocultar sin afectar al otro.
  VITE_MUNICIPAL_MAP_ENABLED: z.enum(['true', 'false']).default('true'),
  VITE_BAGUA_MASTER_ENABLED: z.enum(['true', 'false']).default('true'),
});

export const env = frontendEnvSchema.parse({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_MAP_STYLE_URL: import.meta.env.VITE_MAP_STYLE_URL,
  VITE_MUNICIPAL_MAP_ENABLED: import.meta.env.VITE_MUNICIPAL_MAP_ENABLED,
  VITE_BAGUA_MASTER_ENABLED: import.meta.env.VITE_BAGUA_MASTER_ENABLED,
});
