import type { HealthRepository } from './health.repository.js';
import { logger } from '../../shared/logger.js';

export function createHealthService(repository: HealthRepository) {
  const health = () => ({
    status: 'ok' as const,
    service: 'bagua-webgis-api',
    timestamp: new Date().toISOString(),
  });

  return {
    health,
    async readiness() {
      try {
        await repository.checkDatabase();
        return { ...health(), database: 'ok' as const, postgis: 'ok' as const };
      } catch (error) {
        logger.warn({ err: error }, 'PostgreSQL/PostGIS no disponible');
        return {
          ...health(),
          status: 'unavailable' as const,
          database: 'unavailable' as const,
          postgis: 'unavailable' as const,
        };
      }
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
