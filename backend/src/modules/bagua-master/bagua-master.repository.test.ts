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
