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

export function useBaguaMasterHeights(enabled: boolean) {
  return useQuery({
    queryKey: ['bagua-master', 'alturas', 'mapa'],
    queryFn: ({ signal }) => baguaMasterApi.heightMap(signal),
    enabled,
    staleTime: 600_000,
  });
}

/** Huellas complementarias de otras fuentes abiertas; se piden solo si la capa está activa. */
export function useBaguaMasterComplement(enabled: boolean) {
  return useQuery({
    queryKey: ['bagua-master', 'complemento', 'mapa'],
    queryFn: ({ signal }) => baguaMasterApi.complementMap(signal),
    enabled,
    staleTime: 600_000,
  });
}

/** Programación de las rutas (servicio, días, horario). */
export function useServicePrograms(enabled = true) {
  return useQuery({
    queryKey: ['bagua-master', 'servicio', 'programacion'],
    queryFn: ({ signal }) => baguaMasterApi.servicePrograms(signal),
    enabled,
    staleTime: 600_000,
  });
}

/** Servicios que pasan por un punto y su hora estimada. */
export function useServiceAt(point: [number, number] | null) {
  return useQuery({
    queryKey: [
      'bagua-master',
      'servicio',
      'consulta',
      point?.[0].toFixed(5),
      point?.[1].toFixed(5),
    ],
    queryFn: ({ signal }) => baguaMasterApi.serviceAt(point![0], point![1], signal),
    enabled: !!point,
    staleTime: 600_000,
  });
}

export function useInfrastructure() {
  return useQuery({
    queryKey: ['bagua-master', 'infraestructura'],
    queryFn: ({ signal }) => baguaMasterApi.infrastructure(signal),
    staleTime: 600_000,
  });
}
