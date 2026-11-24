import { describe, expect, it } from 'vitest';
import { ALPHABET, codeFromScan, isValidCode, newCode, normalizeCode } from './codigo-qr.js';

describe('Códigos de los stickers QR', () => {
  it('genera códigos válidos de 8 caracteres sin letras confundibles', () => {
    for (let i = 0; i < 200; i++) {
      const code = newCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('detecta cualquier carácter equivocado', () => {
    const code = newCode();
    for (let pos = 0; pos < 8; pos++)
      for (const ch of ALPHABET) {
        if (ch === code[pos]) continue;
        expect(isValidCode(code.slice(0, pos) + ch + code.slice(pos + 1))).toBe(false);
      }
  });

  it('acepta lo que se escribe a mano o lee la cámara', () => {
    const code = newCode();
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    expect(normalizeCode(typed)).toBe(code);
    expect(codeFromScan(`https://bagua.local/bagua-master/q/${code}`)).toBe(code);
    expect(codeFromScan(` ${code} `)).toBe(code);
  });
});
