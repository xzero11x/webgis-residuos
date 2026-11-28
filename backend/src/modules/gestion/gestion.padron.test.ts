import { describe, expect, it } from 'vitest';
import { checkRows, locateOnStreet, normalizeDocument, parseAddress } from './gestion.padron.js';

describe('Direcciones del padrón', () => {
  it('reconoce la misma dirección escrita de distintas formas', () => {
    expect(parseAddress('JR. AMAZONAS N° 345')).toEqual({
      calle: 'jr amazonas',
      numero: 345,
      interior: '',
    });
    expect(parseAddress('Jirón Amazonas 345')).toEqual({
      calle: 'jr amazonas',
      numero: 345,
      interior: '',
    });
    expect(parseAddress('jr amazonas nro. 345')).toEqual({
      calle: 'jr amazonas',
      numero: 345,
      interior: '',
    });
  });

  it('no confunde el número del nombre de la calle con el de la puerta', () => {
    expect(parseAddress('Av. 28 de Julio 792')).toEqual({
      calle: 'av 28 de julio',
      numero: 792,
      interior: '',
    });
    expect(parseAddress('Avenida 28 de Julio')).toEqual({
      calle: 'av 28 de julio',
      numero: null,
      interior: '',
    });
    expect(parseAddress('Psje. Túpac Amaru 413-A')).toEqual({
      calle: 'psje tupac amaru',
      numero: 413,
      interior: 'a',
    });
  });

  it('ubica un número entre dos vecinos conocidos del mismo lado', () => {
    const known = [
      { numero: 300, punto: [0, 0] as [number, number] },
      { numero: 400, punto: [10, 0] as [number, number] },
      { numero: 351, punto: [5, 5] as [number, number] },
    ];
    expect(locateOnStreet(known, 350)).toEqual([5, 0]);
    expect(locateOnStreet(known, 1200)).toBeNull();
  });
});

describe('Documentos', () => {
  it('completa el cero que Excel borra y rechaza lo que no es DNI ni RUC', () => {
    expect(normalizeDocument('1234567')).toEqual({ value: '01234567', fixed: true, valid: true });
    expect(normalizeDocument(' 91 234 567 ')).toMatchObject({ value: '91234567', valid: true });
    expect(normalizeDocument('12345')).toMatchObject({ valid: false });
    expect(normalizeDocument('')).toMatchObject({ value: null, valid: true });
  });
});

describe('Validación fila por fila', () => {
  const ctx = {
    predios: [
      {
        id: 'p1',
        codigo: 'BG-00001',
        direccion: 'Jr. Amazonas 345',
        key: 'jr amazonas|345',
        calle: 'jr amazonas',
        numero: 345,
        punto: [-78.53, -5.63] as [number, number],
      },
    ],
    byKey: new Map(),
    byStreet: new Map(),
    streets: new Set(['jr amazonas', 'av 28 de julio']),
    participations: new Map(),
    byPredio: new Map(),
    persons: new Map([['91234567', { id: 'per1', nombre: 'Rosa Mego Díaz' }]]),
  };
  ctx.byKey.set('jr amazonas|345', ctx.predios[0]);
  ctx.byStreet.set('jr amazonas', ctx.predios);
  const row = (fila: number, extra: Record<string, string> = {}) => ({
    fila,
    codigo: '',
    direccion: 'JR AMAZONAS 345',
    representante: 'Rosa Mego Díaz',
    dni: '91234567',
    habitantes: '4',
    sector: 'Cercado',
    establecimiento: '',
    tipoEstablecimiento: '',
    ...extra,
  });
  const input = (filas: ReturnType<typeof row>[]) => ({
    servicio: 'reciclables' as const,
    tipoGenerador: 'domiciliario' as const,
    archivo: 'padron.xlsx',
    sha256: 'a'.repeat(64),
    filas,
  });

  it('reconoce el predio y la persona que ya existen', () => {
    const [r] = checkRows(input([row(1)]), ctx);
    expect(r!.estado).toBe('nuevo');
    expect(r!.predio?.id).toBe('p1');
    expect(r!.personaId).toBe('per1');
    expect(r!.ubicacion?.base).toBe('predio');
  });

  it('señala cada error con su fila', () => {
    const rows = checkRows(
      input([
        row(1),
        row(2, { representante: '', habitantes: '0' }),
        row(3, { dni: '91234567', representante: 'Otra Persona Distinta' }),
        row(4, { direccion: 'Calle Inventada 10', dni: '' }),
      ]),
      ctx,
    );
    expect(rows[1]!.errores).toEqual(
      expect.arrayContaining([
        expect.stringContaining('representante'),
        expect.stringContaining('Habitantes'),
      ]),
    );
    expect(rows[2]!.errores[0]).toContain('fila 1');
    expect(rows[3]!.estado).toBe('nuevo');
    expect(rows[3]!.avisos.join(' ')).toContain('Calle no reconocida');
  });
});
