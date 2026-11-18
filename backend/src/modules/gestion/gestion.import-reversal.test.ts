import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reversalInput } from './gestion.import-reversal.js';
describe('contrato de reversión de lote', () => {
  const change = { id: randomUUID(), version: 1, campos: ['direccion'] };
  const request = { clave: randomUUID(), motivo: 'Ensayo trazable', cambios: [change] };
  it('requiere selección, motivo, versión y clave idempotente', () => {
    expect(reversalInput.safeParse(request).success).toBe(true);
    for (const value of [
      { ...request, cambios: [] },
      { ...request, motivo: 'x' },
      { ...request, cambios: [{ ...change, version: 0 }] },
    ])
      expect(reversalInput.safeParse(value).success).toBe(false);
  });
  it('rechaza campos ajenos, duplicados e identidades arbitrarias', () => {
    for (const value of [
      { ...request, cambios: [change, change] },
      { ...request, cambios: [{ ...change, campos: ['direccion', 'direccion'] }] },
      { ...request, cambios: [{ ...change, campos: ['codigo'] }] },
    ])
      expect(reversalInput.safeParse(value).success).toBe(false);
  });
});
