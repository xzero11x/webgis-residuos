import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  PGPOOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // BAGUA MASTER (módulo independiente): se puede desactivar sin afectar al WebGIS municipal.
  BAGUA_MASTER_ENABLED: z.enum(['true', 'false']).default('true'),
  BAGUA_MASTER_DATA_DIR: z
    .string()
    .default(fileURLToPath(new URL('../../../data/bagua-master/', import.meta.url))),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Variables de entorno inválidas: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
  );
}
export const env = parsed.data;
