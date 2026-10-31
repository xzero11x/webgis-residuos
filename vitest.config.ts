import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./frontend/src/', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['backend/src/**/*.test.ts', 'frontend/src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      PGHOST: '127.0.0.1',
      PGPORT: '5432',
      PGDATABASE: 'bagua_test',
      PGUSER: 'bagua_test',
      PGPASSWORD: 'test-only-password',
      LOG_LEVEL: 'silent',
    },
  },
});
