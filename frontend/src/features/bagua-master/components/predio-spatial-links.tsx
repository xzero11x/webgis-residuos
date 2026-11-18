import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { type SpatialLink, useSpatialLinks } from './spatial-links';
import { Button } from '@/components/ui/button';

function fitToLinks(map: MapLibreMap, links: SpatialLink[], duration: number) {
  const coordinates: number[][] = [];
  function collect(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') coordinates.push(value as number[]);
    else value.forEach(collect);
  }
  links.forEach((item) => {
    if ('coordinates' in item.geometria) collect(item.geometria.coordinates);
  });
  if (!coordinates.length) return;
  const narrow = window.innerWidth < 768;
  map.fitBounds(
    [
      [Math.min(...coordinates.map((c) => c[0]!)), Math.min(...coordinates.map((c) => c[1]!))],
      [Math.max(...coordinates.map((c) => c[0]!)), Math.max(...coordinates.map((c) => c[1]!))],
    ],
    {
      maxZoom: 18,
      duration,
      essential: true,
      padding: {
        top: 40,
        left: 25,
        right: narrow ? 60 : 450,
        bottom: narrow ? Math.round(map.getContainer().clientHeight * 0.55) : 40,
      },
    },
  );
}

/**
 * Resalta en el mapa las edificaciones con vínculo confirmado y, cuando el predio no tiene
 * punto administrativo utilizable, acerca el mapa a ellas una sola vez. Solo lectura: nunca
 * cambia la ubicación administrativa del predio.
 */
export function SpatialHighlight({
  id,
  map,
  suspended,
  autoLocate,
}: {
  id: string;
  map: MapLibreMap | null;
  suspended: boolean;
  autoLocate: boolean;
}) {
  const query = useSpatialLinks(id);
  const located = useRef('');
  useEffect(() => {
    if (!map || suspended) return;
    const source = 'bm-predio-vinculos';
    const data: FeatureCollection = {
      type: 'FeatureCollection',
      features: (query.data?.items ?? [])
        .filter((item) => item.estado === 'confirmado')
        .map((item) => ({
          type: 'Feature',
          properties: { id: item.edificio_id },
          geometry: item.geometria,
        })),
    };
    let disposed = false;
    const render = () => {
      if (disposed || !map.isStyleLoaded()) return;
      if (map.getSource(source)) (map.getSource(source) as GeoJSONSource).setData(data);
      else {
        map.addSource(source, { type: 'geojson', data });
        map.addLayer({
          id: source + '-fill',
          type: 'fill',
          source,
          paint: { 'fill-color': '#0070f3', 'fill-opacity': 0.28 },
        });
        map.addLayer({
          id: source + '-line',
          type: 'line',
          source,
          paint: { 'line-color': '#0070f3', 'line-width': 3 },
        });
      }
    };
    render();
    map.once('idle', render);
    return () => {
      disposed = true;
      map.off('idle', render);
      if (map.getLayer(source + '-line')) map.removeLayer(source + '-line');
      if (map.getLayer(source + '-fill')) map.removeLayer(source + '-fill');
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, query.data, suspended]);
  useEffect(() => {
    const confirmed = query.data?.items.filter((item) => item.estado === 'confirmado') ?? [];
    if (!map || suspended || !autoLocate || !confirmed.length || located.current === id) return;
    located.current = id;
    fitToLinks(map, confirmed, 800);
  }, [map, suspended, autoLocate, query.data, id]);
  return null;
}

/** Texto y acción de los vínculos espaciales de un predio (sin efectos sobre el mapa). */
export function PredioSpatialLinks({ id, map }: { id: string; map: MapLibreMap | null }) {
  const query = useSpatialLinks(id);
  const confirmed = query.data?.items.filter((item) => item.estado === 'confirmado') ?? [];
  function locate() {
    if (map) fitToLinks(map, confirmed, 400);
  }
  return (
    <section aria-label="Geometrías vinculadas al predio">
      <h3>Vínculos espaciales</h3>
      {query.isPending ? (
        <p role="status">Consultando geometrías…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>No se pudieron consultar las geometrías vinculadas.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reintentar geometrías
          </Button>
        </div>
      ) : confirmed.length ? (
        <>
          <p>
            {confirmed.length}{' '}
            {confirmed.length === 1 ? 'edificación vinculada' : 'edificaciones vinculadas'} por
            revisión. No certifica límites ni identidad catastral.
          </p>
          <Button variant="outline" disabled={!map} onClick={locate}>
            Ver geometrías vinculadas
          </Button>
        </>
      ) : (
        <p>
          Sin vínculos espaciales confirmados. La ubicación administrativa se conserva por separado.
        </p>
      )}
    </section>
  );
}
