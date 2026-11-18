import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deliveryInput, linkInput, period, predioInput } from './gestion.schema.js';
import { passwordHash, passwordMatches } from './gestion.auth.js';

describe('Gestión administrativa independiente del DEMO histórico', () => {
  it('admite predio sin ubicación y no lo rellena desde un edificio', () => {
    const value = predioInput.parse({ codigo: 'syn-001', direccion: 'Dirección sintética' });
    expect(value).toMatchObject({
      codigo: 'SYN-001',
      ubicacion: null,
      estadoUbicacion: 'pendiente',
    });
    expect(predioInput.safeParse({ ...value, overtureId: 'inventado' }).success).toBe(false);
  });
  it('exige evidencia para una ubicación y distingue ausencia de conflicto', () => {
    const input = {
      codigo: 'SYN-2',
      direccion: 'Sintético',
      ubicacion: { type: 'Point', coordinates: [-78.53, -5.63] },
      estadoUbicacion: 'verificada',
    };
    expect(predioInput.safeParse(input).success).toBe(false);
    expect(
      predioInput.safeParse({ ...input, evidenciaUbicacion: 'Punto sintético de ensayo' }).success,
    ).toBe(true);
    expect(
      predioInput.safeParse({
        ...input,
        evidenciaUbicacion: 'Prueba',
        estadoUbicacion: 'pendiente',
      }).success,
    ).toBe(false);
  });
  it('no convierte cantidad desconocida en cero y exige unidad coherente', () => {
    const input = {
      participacionId: randomUUID(),
      fecha: '2026-11-15',
      material: 'Material de ensayo',
      clave: randomUUID(),
    };
    expect(deliveryInput.parse(input).cantidad).toBeNull();
    expect(deliveryInput.safeParse({ ...input, cantidad: 0, unidad: 'kg' }).success).toBe(false);
    expect(deliveryInput.safeParse({ ...input, cantidad: 5 }).success).toBe(false);
    expect(deliveryInput.safeParse({ ...input, unidad: 'kg' }).success).toBe(false);
    expect(deliveryInput.safeParse({ ...input, cantidad: 5, unidad: 'kg' }).success).toBe(true);
  });
  it('valida periodos y evita identidades ambiguas al vincular', () => {
    const dates = { desde: '2026-02-01', hasta: '2026-01-01', evidencia: 'Ensayo' };
    expect(period.safeParse(dates).success).toBe(false);
    const link = { tipo: 'ocupante', periodo: { desde: '2026-01-01', evidencia: 'Ensayo' } };
    expect(linkInput.safeParse(link).success).toBe(false);
    expect(linkInput.safeParse({ ...link, personaId: randomUUID() }).success).toBe(true);
    expect(
      linkInput.safeParse({
        ...link,
        personaId: randomUUID(),
        persona: { codigo: 'P1', nombre: 'Sintético', tipo: 'natural' },
      }).success,
    ).toBe(false);
  });
  it('contraseñas con sal aleatoria verificables sin guardar el texto', async () => {
    const first = await passwordHash('credencial-sintetica-de-ensayo'),
      second = await passwordHash('credencial-sintetica-de-ensayo');
    expect(first).not.toBe(second);
    expect(first).not.toContain('credencial');
    expect(await passwordMatches('credencial-sintetica-de-ensayo', first)).toBe(true);
    expect(await passwordMatches('otra-credencial', first)).toBe(false);
  });
});
