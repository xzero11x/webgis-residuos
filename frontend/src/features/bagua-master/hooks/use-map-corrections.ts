import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { management } from '@/features/gestion/api';
import { useSession } from '@/features/product/use-session';
import { baguaMasterApi } from '../services/bagua-master-api';
import type { LngLat, MapCorrectionEntry } from '../types';

// Correcciones cartográficas locales: lectura pública para dibujar el mapa y edición con sesión.
const KEY = ['bagua-master', 'correcciones'] as const;

export function useMapCorrections() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => baguaMasterApi.corrections(signal),
    staleTime: 30_000,
  });
}

/** Puede corregir quien tiene sesión con permiso de escritura (no el perfil de consulta). */
export function useCanEditMap() {
  const session = useSession();
  return session.isSuccess && session.data.rol !== 'consulta';
}

export function useMapCorrectionList(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'lista'],
    queryFn: ({ signal }) =>
      management<{ correcciones: MapCorrectionEntry[] }>(
        '/correcciones-mapa',
        'GET',
        undefined,
        signal,
      ),
    enabled,
    staleTime: 0,
  });
}

export type MapCorrectionInput =
  | {
      accion: 'ocultar';
      tabla: 'lugar' | 'edificio' | 'edificio_complemento';
      elementoId: string;
      motivo: string;
    }
  | { accion: 'mover'; tabla: 'lugar'; elementoId: string; punto: LngLat; motivo: string }
  | { accion: 'agregar'; tabla: 'edificio'; anillo: LngLat[]; nombre?: string; motivo: string };

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ['bagua-master', 'buscar'] });
  };
}

export function useCreateMapCorrection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: MapCorrectionInput) => management('/correcciones-mapa', 'POST', input),
    onSuccess: refresh,
  });
}

export function useAnnulMapCorrection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      management(`/correcciones-mapa/${id}/anular`, 'POST', { motivo }),
    onSuccess: refresh,
  });
}
