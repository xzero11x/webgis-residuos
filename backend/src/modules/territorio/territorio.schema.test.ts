import { describe, expect, it } from 'vitest';
import {
  filtersSchema,
  personSchema,
  polygonSchema,
  predioSchema,
  updatePredioSchema,
} from './territorio.schema.js';

const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-78.537, -5.637],
      [-78.536, -5.637],
      [-78.536, -5.636],
      [-78.537, -5.637],
    ],
  ],
};
const input = {
  codigo: 'demo-001',
  direccion: 'Dirección DEMO',
  sectorId: '00000000-0000-4000-8000-000000000201',
  geometry,
};

describe('contrato territorial provisional', () => {
  it('normaliza el código sin inferir vínculos ni servicios', () => {
    expect(predioSchema.parse(input)).toMatchObject({
      codigo: 'DEMO-001',
      personas: [],
      servicios: [],
    });
    expect(personSchema.parse({ nombre: 'Persona DEMO', vinculo: 'Contribuyente' }).vinculo).toBe(
      'Contribuyente',
    );
  });
  it('rechaza anillos abiertos y coordenadas fuera de Bagua', () => {
    expect(
      polygonSchema.safeParse({
        ...geometry,
        coordinates: [[...geometry.coordinates[0]!.slice(0, 3), [-78.538, -5.638]]],
      }).success,
    ).toBe(false);
    expect(
      polygonSchema.safeParse({
        ...geometry,
        coordinates: [
          [
            [-77, -12],
            [-77.1, -12],
            [-77.1, -12.1],
            [-77, -12],
          ],
        ],
      }).success,
    ).toBe(false);
  });
  it('evita repetir servicios y exige una versión al editar', () => {
    const assignment = { servicioId: '00000000-0000-4000-8000-000000000101', rutaId: null };
    expect(predioSchema.safeParse({ ...input, servicios: [assignment, assignment] }).success).toBe(
      false,
    );
    expect(updatePredioSchema.safeParse(input).success).toBe(false);
    expect(updatePredioSchema.safeParse({ ...input, version: 1 }).success).toBe(true);
  });
  it('rechaza filtros desconocidos y no permite cambiar la marca DEMO desde el cliente', () => {
    expect(filtersSchema.safeParse({ servicio: 'cualquiera' }).success).toBe(false);
    expect(filtersSchema.safeParse({ arbitrary: 'value' }).success).toBe(false);
    expect(predioSchema.safeParse({ ...input, isDemo: false }).success).toBe(false);
  });
});
