import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './config/openapi.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import type { HealthRepository } from './modules/health/health.repository.js';
import { logger } from './shared/logger.js';
import { createTerritorioRouter } from './modules/territorio/territorio.routes.js';
import type { TerritorioRepository } from './modules/territorio/territorio.repository.js';
import { createMunicipalRouter } from './modules/municipal/municipal.routes.js';
import type { MunicipalRepository } from './modules/municipal/municipal.repository.js';
import { createBaguaMasterRouter } from './modules/bagua-master/bagua-master.routes.js';
import type { BaguaMasterRepository } from './modules/bagua-master/bagua-master.repository.js';

export function createApp(
  repository: HealthRepository,
  territorio?: TerritorioRepository,
  municipal?: MunicipalRepository,
  baguaMaster?: { repository: BaguaMasterRepository; dataDir: string },
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Swagger uses inline bootstrap code. No remote scripts are allowed.
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", "'unsafe-inline'"],
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: false,
    }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (_request, response) => {
        const id = randomUUID();
        response.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  const healthRouter = createHealthRouter(repository);
  app.use('/api', healthRouter);
  if (territorio) app.use('/api', createTerritorioRouter(territorio));
  if (municipal) app.use('/api/municipal', createMunicipalRouter(municipal));
  // Módulo independiente: solo se monta si está activado; no comparte rutas ni datos con el anterior.
  if (baguaMaster)
    app.use(
      '/api/bagua-master',
      createBaguaMasterRouter(baguaMaster.repository, baguaMaster.dataDir),
    );
  // Direct liveness endpoint for process managers and local tooling.
  app.use(healthRouter);
  app.get('/api/openapi.json', (_request, response) => response.json(openapi));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: 'Bagua WebGIS · API',
      swaggerOptions: { validatorUrl: null },
    }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
