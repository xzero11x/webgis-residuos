import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createBaguaMasterRepository } from './bagua-master.repository.js';

describe('Alturas satelitales independientes de Overture', () => {
  it('identifica las alturas simuladas sin atribuirlas a Google', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', altura_m: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ altura_m: 6.2, metodo: 'modelo-v1', vecinos: 10, referencia_m: 5.5, ghsl_m: 3 }],
      });
    const result = await createBaguaMasterRepository({ query } as unknown as Pool).element(
      'edificio',
      's1',
    );
    expect(result?.alturaM).toBeNull();
    expect(result?.alturaEstimada).toBeNull();
    expect(result?.alturaSimulada).toMatchObject({
      alturaM: 6.2,
      metodo: 'modelo-v1',
      vecinos: 10,
    });
  });

  it('conserva la altura original nula y publica la estimación con su procedencia', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b1', altura_m: null, num_pisos: null }] })
      .mockResolvedValueOnce({
        rows: [
          {
            altura_m: 5.5,
            cobertura: 0.8,
            muestras: 12,
            fuente: 'Google Open Buildings 2.5D Temporal v1',
            fecha: '2023-06-30',
            metodo: 'mediana',
          },
        ],
      });
    const repository = createBaguaMasterRepository({ query } as unknown as Pool);
    const element = await repository.element('edificio', 'b1');
    expect(element?.alturaM).toBeNull();
    expect(element?.numPisos).toBeNull();
    expect(element?.alturaEstimada).toMatchObject({
      alturaM: 5.5,
      cobertura: 0.8,
      fecha: '2023-06-30',
    });
    expect(query.mock.calls[1]?.[1]).toEqual(['b1']);
  });

  it('mantiene sin estimación las huellas sin datos válidos', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b2', altura_m: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const element = await createBaguaMasterRepository({ query } as unknown as Pool).element(
      'edificio',
      'b2',
    );
    expect(element?.alturaEstimada).toBeNull();
    expect(element?.alturaM).toBeNull();
  });
});

describe('Huellas complementarias de otras fuentes abiertas', () => {
  it('publica la procedencia y marca como provisional la altura por defecto', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          id: 'cmp-ms_buildings-1',
          fuente: 'ms_buildings',
          confianza_geo: 'media',
          confianza_valor: null,
          registro_fuente: null,
          area_m2: 78,
          regularizacion: 'rectangulo',
          atributos: {},
          altura_m: 3,
          origen_altura: 'estimada_default',
          altura_cobertura: null,
          altura_muestras: null,
          licencia: 'ODbL-1.0',
          version_fusion: 'fusion-x',
          geometria: { type: 'Polygon', coordinates: [] },
        },
      ],
    });
    const element = await createBaguaMasterRepository({
      query,
    } as unknown as Pool).complementElement('cmp-ms_buildings-1');
    expect(element?.tabla).toBe('edificio_complemento');
    expect(element?.alturaM).toBeNull();
    expect(element?.complemento).toMatchObject({
      fuente: 'ms_buildings',
      confianzaGeo: 'media',
      alturaM: 3,
      origenAltura: 'estimada_default',
    });
    expect(query.mock.calls[0]?.[1]).toEqual(['cmp-ms_buildings-1']);
  });

  it('devuelve null si la huella no existe y consulta solo la tabla complementaria', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = createBaguaMasterRepository({ query } as unknown as Pool);
    expect(await repository.complementElement('nada')).toBeNull();
    expect(String(query.mock.calls[0]?.[0])).toContain('edificio_complemento');
    expect(String(query.mock.calls[0]?.[0])).not.toMatch(/bagua_master\.edificio\s+WHERE/);
  });

  it('el mapa expone solo propiedades ligeras por huella', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          id: 'c1',
          fuente: 'google_presencia',
          confianza_geo: 'baja',
          altura_m: 4.5,
          origen_altura: 'google_temporal',
          area_m2: 40,
          geometry: { type: 'Polygon', coordinates: [] },
        },
      ],
    });
    const map = await createBaguaMasterRepository({ query } as unknown as Pool).complementMap();
    expect(map.features[0]?.properties).toEqual({
      id: 'c1',
      fuente: 'google_presencia',
      confianza: 'baja',
      altura_m: 4.5,
      origen_altura: 'google_temporal',
      area_m2: 40,
    });
  });
});
