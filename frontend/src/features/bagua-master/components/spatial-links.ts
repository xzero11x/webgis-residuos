import { useQuery } from '@tanstack/react-query';
import type { Geometry } from 'geojson';
import { management } from '@/features/gestion/api';

export type SpatialLink = {
  id: string;
  edificio_id: string;
  estado: string;
  geometria: Geometry;
};

export function useSpatialLinks(id: string) {
  return useQuery({
    queryKey: ['gestion', 'espacial', id],
    queryFn: ({ signal }) =>
      management<{ items: SpatialLink[] }>(`/predios/${id}/espacial`, 'GET', undefined, signal),
    retry: false,
    gcTime: 0,
  });
}
/** Centro del recuadro de las edificaciones con vínculo confirmado (null si no hay). */
export function confirmedLinkCenter(links: SpatialLink[] | undefined): [number, number] | null {
  const coordinates: number[][] = [];
  function collect(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') coordinates.push(value as number[]);
    else value.forEach(collect);
  }
  (links ?? [])
    .filter((item) => item.estado === 'confirmado')
    .forEach((item) => {
      if ('coordinates' in item.geometria) collect(item.geometria.coordinates);
    });
  if (!coordinates.length) return null;
  const xs = coordinates.map((c) => c[0]!);
  const ys = coordinates.map((c) => c[1]!);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
