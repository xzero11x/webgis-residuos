import type { Pool } from 'pg';

export interface HealthRepository {
  checkDatabase(): Promise<void>;
}

export function createHealthRepository(pool: Pool): HealthRepository {
  return {
    async checkDatabase() {
      // A successful connection alone is insufficient: the spatial extension must work too.
      await pool.query('SELECT PostGIS_Version() AS postgis_version');
    },
  };
}
