import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { bootstrapAdmin, bootstrapInput } from './bootstrap-admin-core.js';
function target(count: number, database = 'bagua_qa') {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes('current_database')
      ? [{ name: database }]
      : sql.includes('count(*)')
        ? [{ total: count }]
        : sql.includes('RETURNING id')
          ? [{ id: 'qa-user' }]
          : [],
  }));
  const release = vi.fn();
  return { query, release, pool: { connect: async () => ({ query, release }) } as unknown as Pool };
}
const valid = {
  baseConfirmada: 'bagua_qa',
  usuario: 'qa-admin',
  nombre: 'Cuenta sintética QA',
  password: 'synthetic-secret-for-test',
};
describe('Bootstrap inicial controlado', () => {
  it('rechaza campos arbitrarios, identidades y secretos inválidos', () => {
    for (const patch of [{ baseConfirmada: 'db;DROP' }, { password: 'short' }, { rol: 'registro' }])
      expect(bootstrapInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it.each([
    [1, 'bagua_qa', 'BOOTSTRAP_ALREADY_INITIALIZED'],
    [0, 'another_database', 'BOOTSTRAP_DATABASE_MISMATCH'],
  ] as const)(
    'no escribe en destino incorrecto o con cuentas previas',
    async (count, database, reason) => {
      const t = target(count, database);
      await expect(bootstrapAdmin(t.pool, valid)).rejects.toThrow(reason);
      expect(t.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
      expect(t.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
      expect(t.release).toHaveBeenCalled();
    },
  );
  it('crea un único administrador con hash, auditoría sin secretos y commit', async () => {
    const t = target(0);
    expect(await bootstrapAdmin(t.pool, valid)).toEqual({ creado: true });
    expect(t.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    expect(JSON.stringify(t.query.mock.calls)).not.toContain(valid.password);
    expect(t.query.mock.calls.some(([sql]) => sql.includes('usuario.bootstrap'))).toBe(true);
  });
});
