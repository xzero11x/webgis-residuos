import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  serializers: {
    err: (error: { name?: string; code?: string }) => ({
      type: error?.name ?? 'Error',
      code: error?.code,
    }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'PGPASSWORD',
    ],
    censor: '[REDACTED]',
  },
});
