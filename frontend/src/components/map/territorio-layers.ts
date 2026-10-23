import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import {
  EMPTY_COLLECTION,
  TERRITORIO_GROUPS,
  type TerritorioGroupKey,
  type TerritorioVisibility,
} from '@/features/territorio/types';

// Territorio unificado: una fuente por agrupación y capas con minzoom propio.
// El zoom lo aplica MapLibre; la visibilidad solo depende del interruptor de la agrupación.
const font = ['Noto Sans Regular'];
const halo = { 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 };
const source = (group: TerritorioGroupKey) => `tr-${group}`;

export const TERRITORIO_CLICK_LAYERS = [
  'tr-lotes-fill',
  'tr-lotes-line',
  'tr-puntos-circle',
  'tr-sombreados-fill',
  'tr-sombreados-dash',
  'tr-hojas-line',
  'tr-sectores-fill',
  'tr-manzanas-fill',
  'tr-candidatos-line',
  'tr-plano-line',
  'tr-toponimia-circle',
  'tr-calles-label',
];

/** Capas que pertenecen a cada agrupación, para encenderlas o apagarlas en bloque. */
const LAYERS_BY_GROUP: Record<TerritorioGroupKey, string[]> = {
  manzanas: ['tr-manzanas-fill', 'tr-manzanas-line', 'tr-manzanas-dash', 'tr-manzanas-label'],
  calles: ['tr-calles-label'],
  sectores: ['tr-sectores-fill', 'tr-sectores-line', 'tr-sectores-label'],
  lotes: ['tr-lotes-fill', 'tr-lotes-line', 'tr-lotes-dash', 'tr-lotes-label', 'tr-lotes-vivienda'],
  puntos: ['tr-puntos-circle'],
  sombreados: ['tr-sombreados-fill', 'tr-sombreados-dash', 'tr-hojas-line', 'tr-cotas-circle'],
  candidatos: ['tr-candidatos-line', 'tr-candidatos-dash'],
  plano: ['tr-plano-line'],
  toponimia: ['tr-toponimia-circle', 'tr-toponimia-label'],
};

export function installTerritorio(map: Map) {
  for (const group of TERRITORIO_GROUPS)
    map.addSource(source(group.key), { type: 'geojson', data: EMPTY_COLLECTION });
  const f = (group: TerritorioGroupKey) => source(group);
  map.addLayer({
    id: 'tr-manzanas-fill',
    type: 'fill',
    source: f('manzanas'),
    minzoom: 15,
    paint: { 'fill-color': '#c9a46a', 'fill-opacity': 0.16 },
  });
  map.addLayer({
    id: 'tr-manzanas-line',
    type: 'line',
    source: f('manzanas'),
    minzoom: 15,
    filter: ['!=', ['get', 'provisional'], true],
    paint: { 'line-color': '#8a6a3a', 'line-width': 1.1, 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'tr-manzanas-dash',
    type: 'line',
    source: f('manzanas'),
    minzoom: 15,
    filter: ['==', ['get', 'provisional'], true],
    paint: { 'line-color': '#b5712b', 'line-width': 1.3, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'tr-manzanas-label',
    type: 'symbol',
    source: f('manzanas'),
    minzoom: 17,
    // Solo las manzanas con rótulo propio: «sin rótulo» saturaría el mapa.
    filter: ['!', ['in', 'sin rótulo', ['get', 'nombre']]],
    layout: {
      'text-field': ['get', 'nombre'],
      'text-size': 10,
      'text-font': font,
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#6b4a1f', ...halo },
  });
  map.addLayer({
    id: 'tr-sectores-fill',
    type: 'fill',
    source: f('sectores'),
    minzoom: 13,
    paint: { 'fill-color': '#7c9f8a', 'fill-opacity': 0.07 },
  });
  map.addLayer({
    id: 'tr-sectores-line',
    type: 'line',
    source: f('sectores'),
    minzoom: 13,
    paint: {
      'line-color': '#4f7a64',
      'line-width': 1.2,
      'line-dasharray': [4, 3],
      'line-opacity': 0.7,
    },
  });
  map.addLayer({
    id: 'tr-sectores-label',
    type: 'symbol',
    source: f('sectores'),
    minzoom: 13,
    layout: {
      'text-field': ['get', 'nombre'],
      'text-size': 11,
      'text-font': font,
      'symbol-placement': 'point',
    },
    paint: { 'text-color': '#2f5a46', ...halo },
  });
  map.addLayer({
    id: 'tr-calles-label',
    type: 'symbol',
    source: f('calles'),
    minzoom: 15.5,
    layout: {
      'text-field': ['get', 'nombre'],
      'text-size': 11,
      'text-font': font,
      'text-max-width': 16,
      'text-padding': 22,
    },
    paint: { 'text-color': '#53606a', ...halo },
  });
  map.addLayer({
    id: 'tr-lotes-fill',
    type: 'fill',
    source: f('lotes'),
    minzoom: 17,
    filter: ['==', ['get', 'kind'], 'lote'],
    paint: { 'fill-color': '#d9b65c', 'fill-opacity': 0.22 },
  });
  map.addLayer({
    id: 'tr-lotes-line',
    type: 'line',
    source: f('lotes'),
    minzoom: 17,
    filter: ['all', ['==', ['get', 'kind'], 'lote'], ['!=', ['get', 'provisional'], true]],
    paint: { 'line-color': '#9c7a22', 'line-width': 0.9 },
  });
  map.addLayer({
    id: 'tr-lotes-dash',
    type: 'line',
    source: f('lotes'),
    minzoom: 17,
    filter: ['all', ['==', ['get', 'kind'], 'lote'], ['==', ['get', 'provisional'], true]],
    paint: { 'line-color': '#9c7a22', 'line-width': 1.1, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'tr-lotes-label',
    type: 'symbol',
    source: f('lotes'),
    minzoom: 18,
    filter: [
      'all',
      ['==', ['get', 'kind'], 'lote'],
      ['!', ['in', 'sin rótulo', ['get', 'nombre']]],
    ],
    layout: { 'text-field': ['get', 'nombre'], 'text-size': 9.5, 'text-font': font },
    paint: { 'text-color': '#5c4a14', ...halo },
  });
  // Viviendas: contorno documental, distinto del lote aunque tengan la misma forma.
  map.addLayer({
    id: 'tr-lotes-vivienda',
    type: 'line',
    source: f('lotes'),
    minzoom: 17,
    filter: ['==', ['get', 'kind'], 'vivienda'],
    paint: { 'line-color': '#5b7c99', 'line-width': 0.8, 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: 'tr-puntos-circle',
    type: 'circle',
    source: f('puntos'),
    minzoom: 16,
    paint: {
      'circle-radius': 3,
      'circle-color': '#1d6fa5',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  });
  map.addLayer({
    id: 'tr-sombreados-fill',
    type: 'fill',
    source: f('sombreados'),
    minzoom: 15,
    filter: ['==', ['get', 'provisional'], false],
    paint: { 'fill-color': '#8c8c8c', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'tr-sombreados-dash',
    type: 'line',
    source: f('sombreados'),
    minzoom: 15,
    filter: ['==', ['get', 'kind'], 'sombreado'],
    paint: { 'line-color': '#6d6d6d', 'line-width': 0.9, 'line-dasharray': [3, 2] },
  });
  map.addLayer({
    id: 'tr-hojas-line',
    type: 'line',
    source: f('sombreados'),
    minzoom: 13,
    filter: ['==', ['get', 'kind'], 'hoja'],
    paint: { 'line-color': '#5a5f7a', 'line-width': 1.3, 'line-dasharray': [6, 3] },
  });
  map.addLayer({
    id: 'tr-cotas-circle',
    type: 'circle',
    source: f('sombreados'),
    minzoom: 17,
    filter: ['==', ['get', 'kind'], 'cota'],
    paint: {
      'circle-radius': 2.5,
      'circle-color': '#7a5c2e',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  });
  map.addLayer({
    id: 'tr-candidatos-line',
    type: 'line',
    source: f('candidatos'),
    minzoom: 13,
    filter: ['!=', ['get', 'provisional'], true],
    paint: { 'line-color': '#7c3aed', 'line-width': 2.2, 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'tr-candidatos-dash',
    type: 'line',
    source: f('candidatos'),
    minzoom: 13,
    filter: ['==', ['get', 'provisional'], true],
    paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [2, 1.5] },
  });
  map.addLayer({
    id: 'tr-plano-line',
    type: 'line',
    source: f('plano'),
    minzoom: 17,
    paint: {
      'line-color': '#4b6f5c',
      'line-width': 0.9,
      'line-dasharray': [1, 2],
      'line-opacity': 0.8,
    },
  });
  map.addLayer({
    id: 'tr-toponimia-circle',
    type: 'circle',
    source: f('toponimia'),
    minzoom: 14,
    paint: {
      'circle-radius': 3,
      'circle-color': '#a1452f',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  });
  map.addLayer({
    id: 'tr-toponimia-label',
    type: 'symbol',
    source: f('toponimia'),
    minzoom: 15,
    layout: {
      'text-field': ['get', 'nombre'],
      'text-size': 10,
      'text-font': font,
      'text-max-width': 12,
    },
    paint: { 'text-color': '#8a3a22', ...halo },
  });
}

/** Actualiza los datos y la visibilidad de cada agrupación. */
export function updateTerritorio(
  map: Map,
  data: Partial<Record<TerritorioGroupKey, FeatureCollection>>,
  visibility: TerritorioVisibility,
) {
  for (const group of TERRITORIO_GROUPS) {
    const shown = visibility[group.key];
    (map.getSource(source(group.key)) as GeoJSONSource).setData(
      (shown && data[group.key]) || EMPTY_COLLECTION,
    );
    for (const id of LAYERS_BY_GROUP[group.key])
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none');
  }
}
