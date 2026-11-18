import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  assertFixtureTarget,
  fixtureTargetConfigured,
  type FixtureConfig,
} from './fixture-target.js';

const local: FixtureConfig = {
  BAGUA_DEPLOYMENT: 'local',
  BAGUA_FIXTURE_DATABASE: 'bagua_test',
  PGDATABASE: 'bagua_test',
};
function database(name = 'bagua_test') {
  const query = vi.fn().mockResolvedValue({ rows: [{ database: name }] });
  return { query, pool: { query } as unknown as Pick<Pool, 'query'> };
}
describe('Destino explícito de fixtures', () => {
  it.each(['local', 'test'] as const)(
    'permite %s solo tras comprobar la base conectada',
    async (deployment) => {
      const db = database();
      await assertFixtureTarget(db.pool, { ...local, BAGUA_DEPLOYMENT: deployment });
      expect(db.query).toHaveBeenCalledExactlyOnceWith('SELECT current_database() AS database');
    },
  );
  it.each([
    { ...local, BAGUA_DEPLOYMENT: 'production' as const },
    { ...local, BAGUA_FIXTURE_DATABASE: '' },
    { ...local, PGDATABASE: 'municipal_real' },
  ])('rechaza configuración insegura sin consultar ni escribir', async (config) => {
    const db = database();
    expect(fixtureTargetConfigured(config)).toBe(false);
    await expect(assertFixtureTarget(db.pool, config)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FIXTURE_TARGET_BLOCKED',
    });
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rechaza conexión distinta aunque el destino configurado coincida', async () => {
    const db = database('municipal_real');
    await expect(assertFixtureTarget(db.pool, local)).rejects.toMatchObject({
      code: 'FIXTURE_TARGET_BLOCKED',
    });
    expect(db.query.mock.calls).toEqual([['SELECT current_database() AS database']]);
  });
  it('detiene el flujo si la base no responde', async () => {
    const db = database();
    db.query.mockRejectedValueOnce(Error('Conexión no disponible'));
    await expect(assertFixtureTarget(db.pool, local)).rejects.toThrow('Conexión no disponible');
  });
});
