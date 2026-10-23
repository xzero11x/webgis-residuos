import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { RouteMapData } from '../types';

// Capas de las rutas municipales de recolección sobre BAGUA MASTER. Van en fuentes GeoJSON
// propias, encima de las calles de Overture y debajo de sus rótulos; no cambian ninguna capa,
// fuente ni geometría de Overture. Los trazos son los originales: no se ajustan a las calles.
export const ROUTES_SOURCE = 'bm-rutas';
export const ARROWS_SOURCE = 'bm-rutas-flechas';
export const MARKERS_SOURCE = 'bm-rutas-marcadores';
export const ROUTE_LAYERS = [
  'bm-rutas-halo',
  'bm-rutas-linea',
  'bm-rutas-linea-revision',
  'bm-rutas-flechas',
  'bm-rutas-marcadores',
  'bm-rutas-marcadores-texto',
  'bm-rutas-clic',
] as const;
/** Capa invisible y ancha para que el clic y el toque encuentren la ruta con facilidad. */
export const ROUTE_HIT_LAYER = 'bm-rutas-clic';
const BEFORE_LAYER = 'bm-calles-texto';

const DIM = 0.2;
const isSelected = (selected: string): ExpressionSpecification => ['==', ['get', 'ruta'], selected];
const opacity = (selected: string, normal: number, dim = DIM): ExpressionSpecification | number =>
  (selected ? ['case', isSelected(selected), 1, dim] : normal) as ExpressionSpecification | number;
const width = (
  selected: string,
  z12: number,
  z16: number,
  z19: number,
): ExpressionSpecification => {
  const scale = (base: number): ExpressionSpecification | number =>
    selected ? ['*', base, ['case', isSelected(selected), 1.6, 1]] : base;
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    12,
    scale(z12),
    16,
    scale(z16),
    19,
    scale(z19),
  ] as ExpressionSpecification;
};

/** Flecha triangular blanca con borde oscuro (se lee sobre cualquier color de ruta); apunta al norte. */
function arrowImage(): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(size / 2, 4);
  ctx.lineTo(size - 9, size - 7);
  ctx.lineTo(size / 2, size - 15);
  ctx.lineTo(9, size - 7);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#1d2723';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function layers(selected: string): LayerSpecification[] {
  const solid: ExpressionSpecification = ['==', ['get', 'estado'], 'georreferenciada'];
  const review: ExpressionSpecification = ['==', ['get', 'estado'], 'revision'];
  const lineLayout = {
    'line-cap': 'round',
    'line-join': 'round',
    'line-sort-key': (selected ? ['case', isSelected(selected), 1, 0] : 0) as
      ExpressionSpecification | number,
  } as const;
  return [
    {
      id: 'bm-rutas-halo',
      type: 'line',
      source: ROUTES_SOURCE,
      layout: lineLayout,
      paint: {
        'line-color': '#ffffff',
        'line-width': width(selected, 4, 7, 11),
        'line-opacity': opacity(selected, 0.85, 0.12),
      },
    },
    {
      id: 'bm-rutas-linea',
      type: 'line',
      source: ROUTES_SOURCE,
      filter: solid,
      layout: lineLayout,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': width(selected, 2.2, 4, 7),
        'line-opacity': opacity(selected, 0.92),
      },
    },
    {
      // Rutas en revisión: trazo discontinuo, para no confundirlas con las georreferenciadas.
      id: 'bm-rutas-linea-revision',
      type: 'line',
      source: ROUTES_SOURCE,
      filter: review,
      layout: { ...lineLayout, 'line-cap': 'butt' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': width(selected, 2.2, 4, 7),
        'line-dasharray': [2, 1.4],
        'line-opacity': opacity(selected, 0.92),
      },
    },
    {
      id: 'bm-rutas-flechas',
      type: 'symbol',
      source: ARROWS_SOURCE,
      minzoom: 14,
      layout: {
        'icon-image': 'bm-flecha',
        'icon-rotate': ['get', 'rumbo'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.55, 17, 0.8, 20, 1.1],
        'icon-padding': 3,
        'symbol-sort-key': (selected ? ['case', isSelected(selected), 0, 1] : 0) as
          ExpressionSpecification | number,
      },
      paint: { 'icon-opacity': opacity(selected, 1, 0.12) },
    },
    {
      id: 'bm-rutas-marcadores',
      type: 'circle',
      source: MARKERS_SOURCE,
      minzoom: 14,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          ['match', ['get', 'tipo'], 'parada', 3, 5],
          19,
          ['match', ['get', 'tipo'], 'parada', 6, 9],
        ],
        'circle-color': [
          'match',
          ['get', 'tipo'],
          'inicio',
          '#1a7f37',
          'fin',
          '#c62828',
          '#ffffff',
        ],
        'circle-stroke-color': ['match', ['get', 'tipo'], 'parada', '#33413c', '#ffffff'],
        'circle-stroke-width': 2,
        'circle-opacity': opacity(selected, 1, 0.15),
        'circle-stroke-opacity': opacity(selected, 1, 0.15),
      },
    },
    {
      id: 'bm-rutas-marcadores-texto',
      type: 'symbol',
      source: MARKERS_SOURCE,
      minzoom: 15.5,
      filter: ['in', ['get', 'tipo'], ['literal', ['inicio', 'fin']]],
      layout: {
        'text-field': ['match', ['get', 'tipo'], 'inicio', 'Inicio', 'Fin'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 12,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#24231f',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.6,
        'text-opacity': opacity(selected, 1, 0.2),
      },
    },
    {
      id: ROUTE_HIT_LAYER,
      type: 'line',
      source: ROUTES_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 },
    },
  ];
}

function visibilityOf(visible: boolean) {
  return visible ? 'visible' : 'none';
}

/** Añade fuentes, imágenes de flecha y capas de rutas (una sola vez por mapa). */
export function addRouteLayers(
  map: MapLibreMap,
  data: RouteMapData,
  selected: string,
  visible: boolean,
) {
  if (map.getSource(ROUTES_SOURCE)) return;
  map.addSource(ROUTES_SOURCE, { type: 'geojson', data: data.trazos });
  map.addSource(ARROWS_SOURCE, { type: 'geojson', data: data.flechas });
  map.addSource(MARKERS_SOURCE, { type: 'geojson', data: data.marcadores });
  if (!map.hasImage('bm-flecha')) map.addImage('bm-flecha', arrowImage(), { pixelRatio: 2 });
  const before = map.getLayer(BEFORE_LAYER) ? BEFORE_LAYER : undefined;
  for (const layer of layers(selected)) {
    map.addLayer(
      {
        ...layer,
        layout: { ...layer.layout, visibility: visibilityOf(visible) },
      } as LayerSpecification,
      before,
    );
  }
}

/** Muestra u oculta todas las capas de rutas. */
export function setRoutesVisible(map: MapLibreMap, visible: boolean) {
  for (const id of ROUTE_LAYERS)
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibilityOf(visible));
}

/** Destaca una ruta y atenúa las demás (sin ruta seleccionada, todas se ven por igual). */
export function focusRoute(map: MapLibreMap, selected: string) {
  for (const spec of layers(selected)) {
    if (!map.getLayer(spec.id) || spec.id === ROUTE_HIT_LAYER) continue;
    for (const [key, value] of Object.entries(spec.paint ?? {}))
      map.setPaintProperty(spec.id, key as 'line-opacity', value as number);
    for (const key of ['line-sort-key', 'symbol-sort-key'] as const) {
      const value = (spec.layout as Record<string, unknown> | undefined)?.[key];
      if (value !== undefined) map.setLayoutProperty(spec.id, key, value as number);
    }
  }
}

/** Sustituye los datos de las fuentes (por ejemplo, tras recargarlos). */
export function setRouteData(map: MapLibreMap, data: RouteMapData) {
  (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData(data.trazos);
  (map.getSource(ARROWS_SOURCE) as GeoJSONSource | undefined)?.setData(data.flechas);
  (map.getSource(MARKERS_SOURCE) as GeoJSONSource | undefined)?.setData(data.marcadores);
}
