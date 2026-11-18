import { describe, expect, it } from 'vitest';
import { csvCell, csvInput, mapCsv, parseCsv } from './gestion.csv.js';

describe('CSV de padrones con contrato configurable', () => {
  it('lee BOM, comillas escapadas, separadores y saltos dentro de celdas', () => {
    expect(
      parseCsv('\uFEFFclave;ubicacion\r\nTEST-1;"Texto; con ""comillas""\r\ny salto"\r\n', ';'),
    ).toEqual({
      headers: ['clave', 'ubicacion'],
      rows: [['TEST-1', 'Texto; con "comillas"\ny salto']],
    });
  });
  it.each([
    'a;a\n1;2',
    'a;b\n1',
    'a;b\n1;"sin cierre',
    'a;b\n1;"cerrado"x',
    'a;b\n1;2\n\n',
    'a;b\n',
  ])('rechaza estructura inválida sin aceptar filas parciales: %s', (text) => {
    expect(() => parseCsv(text, ';')).toThrow();
  });
  it('mapea variantes sin inventar geometría ni datos ausentes', () => {
    const data = csvInput.parse({
      version: 1,
      sintetico: true,
      nombre: 'ensayo.csv',
      contenido: 'ID,DOMICILIO,ZONA\nTEST-1,Dirección ficticia,A',
      separador: ',',
      mapeo: { codigo: 'ID', direccion: 'DOMICILIO', sector: 'ZONA' },
    });
    expect(mapCsv(data)).toEqual([
      { codigo: 'TEST-1', direccion: 'Dirección ficticia', sector: 'A' },
    ]);
    expect(() => mapCsv({ ...data, mapeo: { codigo: 'ID', direccion: 'NO_EXISTE' } })).toThrow();
    expect(() => mapCsv({ ...data, mapeo: { codigo: 'ID', direccion: 'ID' } })).toThrow();
    expect(csvInput.safeParse({ ...data, sintetico: false }).success).toBe(false);
  });
  it('limita filas para evitar lotes sin cota', () => {
    expect(() => parseCsv('a;b\n' + '1;2\n'.repeat(501), ';')).toThrow();
  });
  it('exporta texto protegido frente a fórmulas sin convertir nulos en cero', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell('=CMD()')).toBe('"\'=CMD()"');
    expect(csvCell('  @SUM(1)')).toBe('"\'  @SUM(1)"');
    expect(csvCell('Texto "A";B')).toBe('"Texto ""A"";B"');
  });
});
