import { useQueries, useQuery } from '@tanstack/react-query';
import { apiGet, apiWrite } from '@/lib/api';
import {
  TERRITORIO_GROUPS,
  type TerritorioEntity,
  type TerritorioGroupKey,
  type TerritorioSummary,
  SECOND_PASS_LAYERS,
  type Catalogos,
  type Filtros,
  type Layers,
  type Predio,
  type PredioInput,
  type SecondPassLayer,
  type SecondPassSummary,
  type SecondPassVisibility,
} from './types';
import type { FeatureCollection } from 'geojson';

export interface CadSourceAudit {
  source: string;
  crsStatus: 'declarado' | 'adoptado' | 'provisional' | 'pendiente';
  offset: [number, number];
  alignment?: {
    translation_m: { dE: number; dN: number };
    vertices_within_5cm: number;
    psad56_difference_m: number;
    adopted?: string;
  };
}
export interface CadInventory {
  layers: { source: string; layer: string; total: number; mapped: number }[];
  audit?: { sources: CadSourceAudit[] };
}
export function useCadInventory(enabled: boolean) {
  return useQuery({
    queryKey: ['cad-inventory'],
    enabled,
    queryFn: ({ signal }) => apiGet('/municipal/cad-inventario', signal) as Promise<CadInventory>,
  });
}
export function useCadReview(
  source: string,
  layer: string,
  bbox: number[] | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['cad-review', source, layer, bbox],
    enabled: enabled && !!source && !!layer && !!bbox,
    queryFn: ({ signal }) =>
      apiGet(
        '/municipal/cad-revision?' +
          new URLSearchParams({ archivo: source, capa: layer, bbox: bbox!.join(',') }),
        signal,
      ) as Promise<FeatureCollection & { truncated: boolean }>,
  });
}

function query(filters: Filtros) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => !!value)).toString();
}
export function useCatalogos() {
  return useQuery({
    queryKey: ['territorio', 'catalogos'],
    queryFn: async ({ signal }) => (await apiGet('/catalogos', signal)) as Catalogos,
    staleTime: 300_000,
  });
}
export function usePredios(filters: Filtros) {
  return useQuery({
    queryKey: ['territorio', 'predios', filters],
    queryFn: async ({ signal }) =>
      (await apiGet(`/predios?${query(filters)}`, signal)) as {
        items: Predio[];
        total: number;
        limit: number;
      },
  });
}
export function usePredio(id: string | null) {
  return useQuery({
    queryKey: ['territorio', 'predio', id],
    queryFn: async ({ signal }) => (await apiGet(`/predios/${id}`, signal)) as Predio,
    enabled: !!id,
  });
}
export function useLayers(filters: Filtros) {
  return useQuery({
    queryKey: ['territorio', 'capas', filters.servicio, filters.ruta, filters.sector],
    queryFn: async ({ signal }) =>
      (await apiGet(`/capas?${query({ ...filters, q: '' })}`, signal)) as Layers,
  });
}
export function useCadReferences(category: 'lote_cad' | 'anotacion_ruta', enabled: boolean) {
  return useQuery({
    queryKey: ['territorio', 'municipal', category],
    queryFn: async ({ signal }) =>
      (await apiGet(`/municipal/referencias?clase=${category}`, signal)) as FeatureCollection,
    staleTime: 300_000,
    enabled,
  });
}
export function useCartography() {
  return useQuery({
    queryKey: ['territorio', 'cartografia'],
    queryFn: async ({ signal }) =>
      (await apiGet('/municipal/cartografia', signal)) as FeatureCollection,
    staleTime: 300_000,
  });
}
export function useSecondPassSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['territorio', 'segunda-pasada', 'resumen'],
    queryFn: async ({ signal }) =>
      (await apiGet('/municipal/segunda-pasada', signal)) as SecondPassSummary,
    staleTime: 300_000,
    enabled,
  });
}
type ReviewCollection = FeatureCollection & { truncated?: boolean };
/** Loads only the switched-on layers; lot labels only for `lotWindow` (high zoom). */
export function useSecondPassLayers(
  shown: SecondPassVisibility,
  lotWindow?: [number, number, number, number],
) {
  const results = useQueries({
    queries: SECOND_PASS_LAYERS.map(({ key }) => {
      const window = key === 'etiquetas-lote' ? lotWindow?.join(',') : undefined;
      return {
        queryKey: ['territorio', 'segunda-pasada', key, window ?? 'todo'],
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (await apiGet(
            `/municipal/segunda-pasada/${key}${window ? `?bbox=${window}` : ''}`,
            signal,
          )) as ReviewCollection,
        staleTime: 300_000,
        placeholderData: (previous?: ReviewCollection) => previous,
        enabled: shown[key] && (key !== 'etiquetas-lote' || !!window),
      };
    }),
  });
  const data: Partial<Record<SecondPassLayer, ReviewCollection>> = {};
  SECOND_PASS_LAYERS.forEach(({ key }, i) => {
    if (results[i]?.data) data[key] = results[i].data;
  });
  return {
    data,
    loading: results.some((r) => r.isFetching),
    failed: results.filter((r) => r.isError),
  };
}
export async function savePredio(input: PredioInput, existing?: { id: string; version: number }) {
  return (await apiWrite(
    existing ? `/predios/${existing.id}` : '/predios',
    existing ? 'PUT' : 'POST',
    existing ? { ...input, version: existing.version } : input,
  )) as Predio;
}
export async function deletePredio(predio: Predio) {
  await apiWrite(`/predios/${predio.id}`, 'DELETE', { version: predio.version });
}

export function useTerritorioSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['territorio', 'unificado', 'resumen'],
    queryFn: async ({ signal }) =>
      (await apiGet('/municipal/territorio/resumen', signal)) as TerritorioSummary,
    staleTime: 300_000,
    enabled,
  });
}

/** Entidades de los grupos activos dentro de la ventana visible. Sin ventana no se consulta. */
export function useTerritorioLayers(
  groups: TerritorioGroupKey[],
  bbox: [number, number, number, number] | undefined,
) {
  const windowKey = bbox ? bbox.map((v) => v.toFixed(4)).join(',') : '';
  const results = useQueries({
    queries: TERRITORIO_GROUPS.map((group) => {
      const active = groups.includes(group.key) && !!bbox;
      return {
        queryKey: ['territorio', 'unificado', 'grupo', group.key, windowKey],
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (await apiGet(
            `/municipal/territorio/entidades?clase=${group.kinds.join(',')}&bbox=${windowKey}`,
            signal,
          )) as FeatureCollection & { truncated?: boolean },
        staleTime: 300_000,
        placeholderData: (previous?: FeatureCollection & { truncated?: boolean }) => previous,
        enabled: active,
      };
    }),
  });
  const data: Partial<Record<TerritorioGroupKey, FeatureCollection & { truncated?: boolean }>> = {};
  TERRITORIO_GROUPS.forEach((group, i) => {
    if (results[i]?.data) data[group.key] = results[i].data;
  });
  return {
    data,
    loading: results.some((r) => r.isFetching),
    failed: results.some((r) => r.isError),
    retry: () => results.forEach((r) => void r.refetch()),
  };
}

export function useTerritorioEntity(id: string | null) {
  return useQuery({
    queryKey: ['territorio', 'unificado', 'entidad', id],
    queryFn: async ({ signal }) =>
      (await apiGet(`/municipal/territorio/entidades/${id}`, signal)) as TerritorioEntity,
    enabled: !!id,
  });
}
