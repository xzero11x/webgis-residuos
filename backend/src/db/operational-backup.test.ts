import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
// @ts-expect-error Script operativo JS ejecutable sin etapa de compilación.
import { validateRecoveryName, main, digest } from '../../../scripts/operational-backup.mjs';
describe('Recuperación operacional no destructiva', () => {
  it('solo admite destinos nuevos con prefijo y formato generado', () => {
    expect(validateRecoveryName('bagua_restore_20261117000000_abcdef01')).toContain(
      'bagua_restore_',
    );
    for (const name of ['bagua_webgis', 'postgres', '../bagua_restore_x', 'bagua_restore_1;DROP'])
      expect(() => validateRecoveryName(name)).toThrow();
  });
  it('rechaza comandos o archivos inválidos antes de llamar Docker', async () => {
    for (const args of [['delete'], ['backup', 'anything'], ['restore'], ['restore', 'copy.sql']])
      await expect(main(args)).rejects.toThrow();
  });
  it('detecta copias corruptas antes de crear una base', async () => {
    const directory = path.resolve('artifacts', 'operacion-prueba', randomUUID());
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'postgis.dump');
    await writeFile(file, 'abc');
    expect(await digest(file)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    await writeFile(file + '.json', JSON.stringify({ version: 1, sha256: '0'.repeat(64) }));
    await expect(main(['restore', file])).rejects.toThrow('La copia o su manifiesto no coinciden');
  });
});
