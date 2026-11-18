import type { Pool } from 'pg';
import { AppError } from '../shared/app-error.js';

export interface FixtureConfig {
  BAGUA_DEPLOYMENT: 'local' | 'test' | 'production';
  BAGUA_FIXTURE_DATABASE: string;
  PGDATABASE: string;
}
export function fixtureTargetConfigured(config: FixtureConfig) {
  return (
    ['local', 'test'].includes(config.BAGUA_DEPLOYMENT) &&
    config.BAGUA_FIXTURE_DATABASE.length > 0 &&
    config.BAGUA_FIXTURE_DATABASE === config.PGDATABASE
  );
}

// No escribe ni cambia de base; comprueba la conexión real además de la configuración.
export async function assertFixtureTarget(pool: Pick<Pool, 'query'>, config: FixtureConfig) {
  if (!fixtureTargetConfigured(config)) throw blocked();
  const result = await pool.query('SELECT current_database() AS database');
  if (result.rows[0]?.database !== config.BAGUA_FIXTURE_DATABASE) throw blocked();
}
function blocked() {
  return new AppError(
    403,
    'FIXTURE_TARGET_BLOCKED',
    'Los datos sintéticos solo pueden escribirse en una base local o de pruebas habilitada explícitamente.',
  );
}
