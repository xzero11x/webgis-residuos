import { describe, expect, it } from 'vitest';
import { resetPasswordInput } from './gestion.users.js';
describe('Restablecimiento administrativo de acceso', () => {
  const valid = {
    actualAdministrador: 'current',
    nueva: 'synthetic-password-2026',
    motivo: 'Recuperación sintética solicitada',
    version: 1,
  };
  it('requiere evidencia, autorización adicional, versión y secreto de longitud suficiente', () => {
    expect(resetPasswordInput.safeParse(valid).success).toBe(true);
    for (const patch of [
      { motivo: 'x' },
      { version: 0 },
      { actualAdministrador: '' },
      { nueva: 'short' },
      { rol: 'administrador' },
    ])
      expect(resetPasswordInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
