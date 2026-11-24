// Códigos de los stickers QR (mismo formato que backend/src/shared/codigo-qr.ts): 7 caracteres en
// base32 de Crockford + 1 de control con pesos impares. El QR solo lleva la URL con el código.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function checkChar(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (2 * i + 1) * ALPHABET.indexOf(body[i]!);
  return ALPHABET[sum % 32]!;
}

export const normalizeCode = (input: string) =>
  input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export function isValidCode(input: string) {
  const code = normalizeCode(input);
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code) && checkChar(code.slice(0, 7)) === code[7];
}

/** Código desde lo que lee la cámara: la URL del sticker o el código suelto. */
export function codeFromScan(text: string) {
  const fromUrl = /\/q\/([0-9A-Za-z-]{8,9})/.exec(text)?.[1];
  return normalizeCode(fromUrl ?? text);
}

/** «7K3M9PQX» → «7K3M-9PQX», más fácil de leer y dictar. */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** URL que va dentro del QR: abre el horario para el vecino o la visita para el promotor. */
export const qrUrl = (code: string) => `${window.location.origin}/bagua-master/q/${code}`;
