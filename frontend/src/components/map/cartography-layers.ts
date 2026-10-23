import type { Map, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { EMPTY_COLLECTION, type Visibility } from '@/features/territorio/types';

export function installCartography(map: Map) {
  map.addSource('cartography', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addLayer({
    id: 'cad-zones',
    type: 'line',
    source: 'cartography',
    filter: ['==', ['get', 'kind'], 'zona'],
    paint: {
      'line-color': '#b48543',
      'line-width': 1.4,
      'line-dasharray': [3, 3],
      'line-opacity': 0.7,
    },
  });
  map.addLayer({
    id: 'cad-directions',
    type: 'symbol',
    source: 'cartography',
    minzoom: 13,
    filter: ['==', ['get', 'kind'], 'sentido'],
    layout: {
      'text-field': '▲',
      'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 14],
      'text-font': ['Noto Sans Regular'],
      'text-rotate': ['get', 'bearing'],
      'text-rotation-alignment': 'map',
      'text-padding': 12,
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#243a49', 'text-halo-color': '#ffffff', 'text-halo-width': 1.7 },
  });
  map.addLayer({
    id: 'cad-stops',
    type: 'circle',
    source: 'cartography',
    minzoom: 13,
    filter: ['in', ['get', 'kind'], ['literal', ['inicio', 'fin', 'parada']]],
    paint: {
      'circle-radius': ['match', ['get', 'kind'], 'parada', 5, 10],
      'circle-color': ['match', ['get', 'kind'], 'inicio', '#148566', 'fin', '#b34647', '#fff'],
      'circle-stroke-color': ['match', ['get', 'kind'], 'parada', '#324f66', '#fff'],
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'cad-marker-label',
    type: 'symbol',
    source: 'cartography',
    minzoom: 13,
    filter: ['in', ['get', 'kind'], ['literal', ['inicio', 'fin']]],
    layout: {
      'text-field': ['match', ['get', 'kind'], 'inicio', 'I', 'F'],
      'text-size': 11,
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#fff' },
  });
  map.addLayer({
    id: 'cad-streets',
    type: 'symbol',
    source: 'cartography',
    minzoom: 15.5,
    filter: ['==', ['get', 'kind'], 'calle'],
    layout: {
      'text-field': ['get', 'nombre'],
      'text-size': 11,
      'text-font': ['Noto Sans Regular'],
      'text-max-width': 16,
      'text-padding': 22,
    },
    paint: { 'text-color': '#53606a', 'text-halo-color': '#fff', 'text-halo-width': 2 },
  });
  map.addLayer({
    id: 'cad-review',
    type: 'circle',
    source: 'cartography',
    minzoom: 15,
    filter: ['==', ['get', 'kind'], 'revision'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#c28a38',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  });
  map.addLayer({
    id: 'cad-times',
    type: 'symbol',
    source: 'cartography',
    minzoom: 17,
    filter: ['==', ['get', 'kind'], 'horario'],
    layout: {
      'text-field': ['concat', ['get', 'nombre'], ' · sin validar'],
      'text-size': 11,
      'text-font': ['Noto Sans Regular'],
      'text-padding': 15,
    },
    paint: { 'text-color': '#8c6026', 'text-halo-color': '#fff', 'text-halo-width': 2 },
  });
}

export function updateCartography(
  map: Map,
  data: FeatureCollection | undefined,
  visibility: Visibility,
  technical: boolean,
  routeCode: string,
  visibleCodes: string[],
) {
  const features = (data?.features || []).filter((f) => {
    const p = f.properties;
    if (!p) return false;
    if (['calle', 'zona', 'revision', 'horario'].includes(p.kind))
      return technical || p.kind === 'calle';
    // An ambiguous route association stays visible only in the overview.
    if (routeCode) return p.routeCode === routeCode;
    return !p.routeCode || visibleCodes.includes(p.routeCode);
  });
  (map.getSource('cartography') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  const settings: Record<string, boolean> = {
    'cad-zones': technical && visibility.zonas,
    'cad-directions': visibility.sentidos && visibility.rutas,
    'cad-stops': visibility.simbolos,
    'cad-marker-label': visibility.simbolos,
    'cad-streets': visibility.calles,
    'cad-review': technical && visibility.revision,
    'cad-times': technical && visibility.horarios,
  };
  for (const [id, shown] of Object.entries(settings))
    map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none');
}
