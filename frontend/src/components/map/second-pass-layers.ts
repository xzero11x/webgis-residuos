import type { ExpressionSpecification, GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import {
  EMPTY_COLLECTION,
  LOT_LABEL_MIN_ZOOM,
  SECOND_PASS_LAYERS,
  type SecondPassLayer,
  type SecondPassVisibility,
} from '@/features/territorio/types';

/** Colors of the three accepted never-inserted blocks (docs/dwg-segunda-pasada.md). */
export const BLOCK_COLORS = { ffddcdcdc: '#7c3aed', vfvfbb: '#0f766e', fvfvvd: '#be123c' };
export const TOPONYM_COLORS = {
  calle: '#56616c',
  sector: '#6d4c99',
  institucion: '#a1452f',
  hidrografia: '#1f6fae',
};
const source = (layer: SecondPassLayer) => `sp-${layer}`;
const matchColor = (property: string, colors: Record<string, string>) =>
  [
    'match',
    ['get', property],
    ...Object.entries(colors).flat(),
    '#555',
  ] as unknown as ExpressionSpecification;
const font = ['Noto Sans Regular'];
const halo = { 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 };

/** Map layer ids per second-pass layer; the click handler queries them in this order. */
export const SECOND_PASS_MAP_LAYERS: Record<SecondPassLayer, string[]> = {
  'puntos-topograficos': ['sp-puntos', 'sp-puntos-label'],
  cotas: ['sp-cotas'],
  'etiquetas-lote': ['sp-etiquetas'],
  toponimia: ['sp-toponimia'],
  'rutas-bloques': ['sp-bloques-simbolo', 'sp-bloques-line'],
  manzanas: ['sp-manzanas-fill', 'sp-manzanas-line'],
  'hojas-planos': ['sp-hojas-fill', 'sp-hojas-line'],
};
export const SECOND_PASS_CLICK_LAYERS = [
  'sp-puntos',
  'sp-cotas',
  'sp-etiquetas',
  'sp-toponimia',
  'sp-bloques-simbolo',
  'sp-bloques-line',
];
// Area fills are only picked when nothing more specific is under the pointer.
export const SECOND_PASS_AREA_LAYERS = ['sp-manzanas-fill', 'sp-hojas-fill'];

export function installSecondPass(map: Map) {
  for (const { key } of SECOND_PASS_LAYERS)
    map.addSource(source(key), { type: 'geojson', data: EMPTY_COLLECTION });
  const hidden = { visibility: 'none' as const };
  map.addLayer({
    id: 'sp-hojas-fill',
    type: 'fill',
    source: source('hojas-planos'),
    layout: hidden,
    paint: { 'fill-color': '#5a5f7a', 'fill-opacity': 0.03 },
  });
  map.addLayer({
    id: 'sp-hojas-line',
    type: 'line',
    source: source('hojas-planos'),
    layout: hidden,
    paint: { 'line-color': '#5a5f7a', 'line-width': 1.3, 'line-dasharray': [6, 3] },
  });
  map.addLayer({
    id: 'sp-manzanas-fill',
    type: 'fill',
    source: source('manzanas'),
    layout: hidden,
    paint: {
      'fill-color': ['case', ['==', ['get', 'status'], 'por revisar'], '#d08a2e', '#8a7d6b'],
      'fill-opacity': ['case', ['==', ['get', 'status'], 'por revisar'], 0.16, 0.05],
    },
  });
  map.addLayer({
    id: 'sp-manzanas-line',
    type: 'line',
    source: source('manzanas'),
    layout: hidden,
    paint: { 'line-color': '#8a6a45', 'line-width': 0.9, 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: 'sp-bloques-line',
    type: 'line',
    source: source('rutas-bloques'),
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { ...hidden, 'line-cap': 'round' },
    paint: {
      'line-color': matchColor('bloque_origen', BLOCK_COLORS),
      'line-width': 2.2,
      'line-dasharray': [2, 1.5],
      'line-opacity': [
        'case',
        ['==', ['get', 'comparacion_modelo'], 'no presente en el modelo'],
        0.95,
        0.5,
      ],
    },
  });
  // SENTIDO DE RUTA arrows of the recovered blocks, oriented by their calibrated bearing.
  map.addLayer({
    id: 'sp-bloques-simbolo',
    type: 'symbol',
    source: source('rutas-bloques'),
    minzoom: 14,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'rumbo_grados']],
    layout: {
      ...hidden,
      'text-field': '▲',
      'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 18, 13],
      'text-font': font,
      'text-rotate': ['get', 'rumbo_grados'],
      'text-rotation-alignment': 'map',
      'text-padding': 8,
    },
    paint: { 'text-color': matchColor('bloque_origen', BLOCK_COLORS), ...halo },
  });
  map.addLayer({
    id: 'sp-puntos',
    type: 'circle',
    source: source('puntos-topograficos'),
    minzoom: 14,
    layout: hidden,
    paint: {
      'circle-radius': ['case', ['get', 'cota_utilizable'], 3.6, 2.4],
      'circle-color': ['case', ['get', 'cota_utilizable'], '#1d6fa5', '#a3a9ae'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  });
  // Only heights that match their Z label and the urban range are labelled.
  map.addLayer({
    id: 'sp-puntos-label',
    type: 'symbol',
    source: source('puntos-topograficos'),
    minzoom: 18,
    filter: ['==', ['get', 'cota_utilizable'], true],
    layout: {
      ...hidden,
      'text-field': ['concat', ['number-format', ['get', 'z'], { 'max-fraction-digits': 2 }], ' m'],
      'text-size': 10,
      'text-font': font,
      'text-offset': [0, 1],
    },
    paint: { 'text-color': '#1d5f8c', ...halo },
  });
  map.addLayer({
    id: 'sp-toponimia',
    type: 'symbol',
    source: source('toponimia'),
    minzoom: 15,
    layout: {
      ...hidden,
      'text-field': ['get', 'texto'],
      'text-size': ['match', ['get', 'clase'], 'calle', 10, 11],
      'text-font': font,
      'text-max-width': 12,
      'text-padding': 6,
    },
    paint: {
      'text-color': matchColor('clase', TOPONYM_COLORS),
      ...halo,
    },
  });
  map.addLayer({
    id: 'sp-cotas',
    type: 'symbol',
    source: source('cotas'),
    minzoom: 18,
    layout: {
      ...hidden,
      'text-field': [
        'concat',
        ['number-format', ['get', 'valor'], { 'max-fraction-digits': 2 }],
        ['case', ['==', ['get', 'unidad'], 'grados'], '°', ' m'],
      ],
      'text-size': 9.5,
      'text-font': font,
    },
    paint: { 'text-color': '#7a5c2e', ...halo },
  });
  map.addLayer({
    id: 'sp-etiquetas',
    type: 'symbol',
    source: source('etiquetas-lote'),
    minzoom: LOT_LABEL_MIN_ZOOM,
    layout: {
      ...hidden,
      'text-field': ['get', 'texto'],
      'text-size': 9.5,
      'text-font': font,
      'text-padding': 2,
    },
    paint: { 'text-color': '#4b5157', ...halo },
  });
}

const uploaded = new WeakMap<Map, Partial<Record<SecondPassLayer, FeatureCollection>>>();

export function updateSecondPass(
  map: Map,
  data: Partial<Record<SecondPassLayer, FeatureCollection>>,
  shown: SecondPassVisibility,
  technical: boolean,
) {
  const previous = uploaded.get(map) ?? {};
  for (const { key } of SECOND_PASS_LAYERS) {
    const visible = technical && shown[key];
    const next = (visible && data[key]) || EMPTY_COLLECTION;
    // Re-uploading several MB of GeoJSON on every render would stall the worker.
    if (previous[key] !== next) (map.getSource(source(key)) as GeoJSONSource).setData(next);
    previous[key] = next;
    for (const id of SECOND_PASS_MAP_LAYERS[key])
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
  uploaded.set(map, previous);
}
