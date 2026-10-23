import type { TerritorioRepository } from './territorio.repository.js';
import type { Filters, PredioInput, PredioUpdate } from './territorio.schema.js';

export function createTerritorioService(repository: TerritorioRepository) {
  return {
    list: (filters: Filters) => repository.list(filters),
    detail: (id: string) => repository.find(id),
    catalogs: () => repository.catalogs(),
    layers: (filters: Filters) => repository.layers(filters),
    create: (input: PredioInput) => repository.create(input),
    update: (id: string, input: PredioUpdate) => repository.update(id, input),
    remove: (id: string, version: number) => repository.remove(id, version),
  };
}
