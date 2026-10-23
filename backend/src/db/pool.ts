import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

export const pool = new pg.Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  max: env.PGPOOL_MAX,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30_000,
  query_timeout: 3000,
  statement_timeout: 3000,
  application_name: 'bagua-webgis',
});

pool.on('error', (error) => logger.error({ err: error }, 'Error en conexión PostgreSQL inactiva'));
