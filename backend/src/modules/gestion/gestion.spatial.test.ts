import { describe, expect, it } from 'vitest';
import { spatialProposal, spatialDecision } from './gestion.spatial.js';
describe('Contrato de revisión espacial explícita', () => {
  const proposal = {
    edificioId: 'id-overture',
    criterio: 'seleccion_mapa',
    evidencia: 'Evidencia sintética documentada',
    versionPredio: 1,
  };
  it('no admite geometrías arbitrarias ni criterios de coincidencia débil', () => {
    expect(
      spatialProposal.safeParse({ ...proposal, geometria: { type: 'Point', coordinates: [0, 0] } })
        .success,
    ).toBe(false);
    expect(spatialProposal.safeParse({ ...proposal, criterio: 'direccion_parecida' }).success).toBe(
      false,
    );
  });
  it('exige evidencia y versión del predio antes de proponer', () => {
    expect(spatialProposal.safeParse({ ...proposal, evidencia: '' }).success).toBe(false);
    expect(spatialProposal.safeParse({ ...proposal, versionPredio: 0 }).success).toBe(false);
    expect(spatialProposal.safeParse(proposal).success).toBe(true);
  });
  it('requiere motivo y versiones para una decisión sin aceptar coordenadas nuevas', () => {
    const decision = {
      estado: 'confirmado',
      motivo: 'Revisión humana de ensayo',
      version: 1,
      versionPredio: 1,
    };
    expect(spatialDecision.parse(decision).compartido).toBe(false);
    expect(spatialDecision.safeParse({ ...decision, motivo: '' }).success).toBe(false);
    expect(spatialDecision.safeParse({ ...decision, coordenadas: [0, 0] }).success).toBe(false);
  });
});
