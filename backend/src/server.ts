import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { createHealthRepository } from './modules/health/health.repository.js';
import { logger } from './shared/logger.js';
import { createTerritorioRepository } from './modules/territorio/territorio.repository.js';
import { createMunicipalRepository } from './modules/municipal/municipal.repository.js';
import { createBaguaMasterRepository } from './modules/bagua-master/bagua-master.repository.js';

const app = createApp(
  createHealthRepository(pool),
  createTerritorioRepository(pool),
  createMunicipalRepository(pool),
  env.BAGUA_MASTER_ENABLED === 'true'
    ? { repository: createBaguaMasterRepository(pool), dataDir: env.BAGUA_MASTER_DATA_DIR }
    : undefined,
);
const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, 'API Bagua WebGIS iniciada');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Cerrando servidor');
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(() => {
    void pool
      .end()
      .then(() => {
        clearTimeout(timeout);
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'No se pudo cerrar PostgreSQL');
        process.exit(1);
      });
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
