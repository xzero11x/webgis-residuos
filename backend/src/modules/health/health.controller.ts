import type { RequestHandler } from 'express';
import type { HealthService } from './health.service.js';

export function createHealthController(service: HealthService) {
  const health: RequestHandler = (_request, response) => {
    response.set('Cache-Control', 'no-store').json(service.health());
  };
  const ready: RequestHandler = async (_request, response) => {
    const result = await service.readiness();
    response
      .set('Cache-Control', 'no-store')
      .status(result.status === 'ok' ? 200 : 503)
      .json(result);
  };
  return { health, ready };
}
