import { Router } from 'express';
import type { HealthRepository } from './health.repository.js';
import { createHealthService } from './health.service.js';
import { createHealthController } from './health.controller.js';

export function createHealthRouter(repository: HealthRepository) {
  const router = Router();
  const controller = createHealthController(createHealthService(repository));
  router.get('/health', controller.health);
  router.get('/ready', controller.ready);
  return router;
}
