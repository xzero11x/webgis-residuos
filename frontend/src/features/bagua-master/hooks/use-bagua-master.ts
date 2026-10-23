import { useQuery } from '@tanstack/react-query';
import { baguaMasterApi } from '../services/bagua-master-api';
import type { Selection } from '../types';

// Claves propias: no comparten caché con las consultas del mapa municipal.
export function useBaguaMasterSummary() {
  return useQuery({
    queryKey: ['bagua-master', 'resumen'],
    queryFn: ({ signal }) => baguaMasterApi.summary(signal),
    staleTime: 600_000,
  });
}

export function useBaguaMasterElement(selection: Selection | null) {
  return useQuery({
    queryKey: ['bagua-master', 'elemento', selection?.tabla, selection?.id],
    queryFn: ({ signal }) => baguaMasterApi.element(selection!.tabla, selection!.id, signal),
    enabled: !!selection,
    staleTime: 600_000,
  });
}

export function useBaguaMasterSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['bagua-master', 'buscar', term],
    queryFn: ({ signal }) => baguaMasterApi.search(term, signal),
    enabled: term.length >= 2,
    staleTime: 600_000,
  });
}

export function useBaguaMasterRoutes(enabled: boolean) {
  return useQuery({
    queryKey: ['bagua-master', 'rutas'],
    queryFn: ({ signal }) => baguaMasterApi.routes(signal),
    enabled,
    staleTime: 600_000,
  });
}

export function useBaguaMasterRouteMap(enabled: boolean) {
  return useQuery({
    queryKey: ['bagua-master', 'rutas', 'mapa'],
    queryFn: ({ signal }) => baguaMasterApi.routeMap(signal),
    enabled,
    staleTime: 600_000,
  });
}
