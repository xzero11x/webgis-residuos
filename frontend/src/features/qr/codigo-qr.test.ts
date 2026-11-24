import { describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { codeFromScan, formatCode, isValidCode, normalizeCode } from './codigo-qr';

// Mismos códigos que genera el backend y la simulación (pesos impares en el control).
const KNOWN = ['JA2SKACY', 'JH1083G3'];

/** Dibuja el QR en píxeles (escala 6, margen 4 módulos) y lo lee con jsQR, como hace la cámara. */
function roundTrip(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const scale = 6;
  const size = (modules + 8) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < modules; r++)
    for (let c = 0; c < modules; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + 4) * scale + y) * size + (c + 4) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return jsQR(data, size, size)?.data;
}

describe('Stickers QR', () => {
  it('valida los códigos del backend y rechaza un carácter cambiado', () => {
    for (const code of KNOWN) {
      expect(isValidCode(code)).toBe(true);
      expect(isValidCode(code.slice(0, 7) + (code[7] === 'A' ? 'B' : 'A'))).toBe(false);
    }
  });

  it('acepta el código escrito a mano con guion, minúsculas u O por 0', () => {
    expect(normalizeCode('jh10-83g3')).toBe('JH1083G3');
    expect(isValidCode('JH1O-83G3')).toBe(true);
    expect(formatCode('JH1083G3')).toBe('JH10-83G3');
  });

  it('el QR impreso se lee y devuelve el código del predio', () => {
    const url = 'https://bagua.local/bagua-master/q/JH1083G3';
    const read = roundTrip(url);
    expect(read).toBe(url);
    expect(codeFromScan(read!)).toBe('JH1083G3');
  });
});
