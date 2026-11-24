import { randomInt } from 'node:crypto';

// Códigos de los stickers QR: 7 caracteres aleatorios en base32 de Crockford (sin I, L, O ni U,
// que se confunden al leer o dictar) y 1 carácter de control. El control detecta un carácter
// equivocado o dos adyacentes intercambiados al escribir el código a mano.
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function checkChar(body: string) {
  let sum = 0;
  // Pesos impares (1, 3, 5…): son invertibles módulo 32, así cualquier carácter equivocado cambia el control.
  for (let i = 0; i < body.length; i++) sum += (2 * i + 1) * ALPHABET.indexOf(body[i]!);
  return ALPHABET[sum % 32]!;
}

/** Normaliza lo que se escribe o se lee: mayúsculas, sin guiones ni espacios, O→0 e I/L→1. */
export function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function isValidCode(input: string) {
  const code = normalizeCode(input);
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code)) return false;
  return checkChar(code.slice(0, 7)) === code[7];
}

export function newCode() {
  let body = '';
  for (let i = 0; i < 7; i++) body += ALPHABET[randomInt(32)];
  return body + checkChar(body);
}

/** Extrae el código de lo que entrega la cámara: la URL del sticker o el código suelto. */
export function codeFromScan(text: string) {
  const fromUrl = /\/q\/([0-9A-Za-z-]{8,9})/.exec(text)?.[1];
  return normalizeCode(fromUrl ?? text);
}
