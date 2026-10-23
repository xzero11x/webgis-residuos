import type { Map, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { EMPTY_COLLECTION } from '@/features/territorio/types';

export const CAD_REVIEW_LAYERS = ['cad-inspect-line', 'cad-inspect-point', 'cad-inspect-label'];
export function installCadReview(map: Map) {
  map.addSource('cad-inspect', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addLayer({
    id: 'cad-inspect-line',
    type: 'line',
    source: 'cad-inspect',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'cad-inspect-point',
    type: 'circle',
    source: 'cad-inspect',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': 3,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  });
  map.addLayer({
    id: 'cad-inspect-label',
    type: 'symbol',
    source: 'cad-inspect',
    minzoom: 16,
    filter: ['!=', ['get', 'text'], null],
    layout: { 'text-field': ['get', 'text'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  });
}
export function updateCadReview(map: Map, data: FeatureCollection | undefined) {
  (map.getSource('cad-inspect') as GeoJSONSource).setData(data || EMPTY_COLLECTION);
}
