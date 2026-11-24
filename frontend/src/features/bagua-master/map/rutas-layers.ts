import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { RouteMapData } from '../types';

// Capas de las rutas municipales de recolección sobre BAGUA MASTER. Van en fuentes GeoJSON
// propias, encima de las calles de Overture y debajo de sus rótulos; no cambian ninguna capa,
// fuente ni geometría de Overture. Los trazos vienen ajustados a la red vial (docs/coherencia-interna.md).
export const ROUTES_SOURCE = 'bm-rutas';
export const ARROWS_SOURCE = 'bm-rutas-flechas';
export const MARKERS_SOURCE = 'bm-rutas-marcadores';
export const ROUTE_LAYERS = [
  'bm-rutas-sombra',
  'bm-rutas-halo',
  'bm-rutas-linea',
  'bm-rutas-linea-revision',
  'bm-rutas-flechas',
  'bm-rutas-paradas',
  'bm-rutas-extremos',
  'bm-rutas-marcadores-texto',
  'bm-rutas-clic',
] as const;
/** Capa invisible y ancha para que el clic y el toque encuentren la ruta con facilidad. */
export const ROUTE_HIT_LAYER = 'bm-rutas-clic';
const BEFORE_LAYER = 'bm-calles-texto';

/**
 * Paleta de presentación: un color claramente distinto por ruta (los planos usaban tres naranjas
 * casi iguales). La ruta orgánica va en verde. Las rutas nuevas usan el color de su plano.
 */
export const ROUTE_PALETTE: Record<string, string> = {
  'MUN-1001': '#2563eb',
  'MUN-2001': '#db2777',
  'MUN-2002': '#f59e0b',
  'CAD-2026': '#7c3aed',
  'CAD-PRIMAVERA': '#0d9488',
  'CAD-RUTAS': '#64748b',
  'MUN-ORGANICA': '#16a34a',
};
export const routeColor = (code: string, fallback: string) => ROUTE_PALETTE[code] ?? fallback;
const FALLBACK = '#475569';
const COLOR = [
  'match',
  ['get', 'ruta'],
  ...Object.entries(ROUTE_PALETTE).flat(),
  ['coalesce', ['get', 'color'], FALLBACK],
] as unknown as ExpressionSpecification;

const DIM = 0.18;
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
    selected ? ['*', base, ['case', isSelected(selected), 1.45, 0.85]] : base;
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

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return [element, element.getContext('2d')!] as const;
}

/** Insignia de sentido: disco del color de la ruta, borde blanco y chevrón blanco hacia el norte. */
function arrowBadge(color: string): ImageData {
  const size = 44;
  const [, ctx] = canvas(size, size);
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c - 8, c + 5);
  ctx.lineTo(c, c - 4);
  ctx.lineTo(c + 8, c + 5);
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** Píldora estirable para las etiquetas de inicio y fin. */
function pill(color: string): ImageData {
  const [w, h, r] = [36, 28, 12];
  const [, ctx] = canvas(w, h);
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, r);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  return ctx.getImageData(0, 0, w, h);
}
const PILL_OPTIONS = {
  pixelRatio: 2,
  stretchX: [[14, 22]] as [number, number][],
  stretchY: [[13, 15]] as [number, number][],
  content: [10, 6, 26, 22] as [number, number, number, number],
};
const START = '#15803d';
const END = '#111827';

function layers(selected: string): LayerSpecification[] {
  const solid: ExpressionSpecification = ['==', ['get', 'estado'], 'georreferenciada'];
  const review: ExpressionSpecification = ['==', ['get', 'estado'], 'revision'];
  const sortKey = (selected ? ['case', isSelected(selected), 1, 0] : 0) as
    ExpressionSpecification | number;
  const lineLayout = {
    'line-cap': 'round',
    'line-join': 'round',
    'line-sort-key': sortKey,
  } as const;
  return [
    // Sombra suave: separa la ruta del mapa sin recargarlo.
    {
      id: 'bm-rutas-sombra',
      type: 'line',
      source: ROUTES_SOURCE,
      layout: lineLayout,
      paint: {
        'line-color': '#0f172a',
        'line-width': width(selected, 5, 9, 15),
        'line-blur': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 5],
        'line-translate': [0, 1.5],
        'line-opacity': opacity(selected, 0.16, 0.04),
      },
    },
    {
      id: 'bm-rutas-halo',
      type: 'line',
      source: ROUTES_SOURCE,
      layout: lineLayout,
      paint: {
        'line-color': '#ffffff',
        'line-width': width(selected, 3.6, 7, 11.5),
        'line-opacity': opacity(selected, 0.95, 0.12),
      },
    },
    {
      id: 'bm-rutas-linea',
      type: 'line',
      source: ROUTES_SOURCE,
      filter: solid,
      layout: lineLayout,
      paint: {
        'line-color': COLOR,
        'line-width': width(selected, 2, 4.2, 7.5),
        'line-opacity': opacity(selected, 1),
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
        'line-color': COLOR,
        'line-width': width(selected, 2, 4.2, 7.5),
        'line-dasharray': [1.6, 1.1],
        'line-opacity': opacity(selected, 1),
      },
    },
    {
      // Sentido del plano: insignias del color de la ruta; las que chocan se omiten (sin saturar).
      id: 'bm-rutas-flechas',
      type: 'symbol',
      source: ARROWS_SOURCE,
      minzoom: 14.5,
      layout: {
        'icon-image': ['concat', 'bm-flecha-', ['get', 'ruta']],
        'icon-rotate': ['get', 'rumbo'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14.5, 0.42, 17, 0.62, 20, 0.85],
        'icon-padding': 6,
        'symbol-sort-key': (selected ? ['case', isSelected(selected), 0, 1] : 0) as
          ExpressionSpecification | number,
      },
      paint: { 'icon-opacity': opacity(selected, 1, 0.12) },
    },
    {
      id: 'bm-rutas-paradas',
      type: 'circle',
      source: MARKERS_SOURCE,
      minzoom: 14,
      filter: ['==', ['get', 'tipo'], 'parada'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 19, 6.5],
        'circle-color': '#ffffff',
        'circle-stroke-color': COLOR,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 14, 1.6, 19, 2.6],
        'circle-opacity': opacity(selected, 1, 0.15),
        'circle-stroke-opacity': opacity(selected, 1, 0.15),
      },
    },
    {
      id: 'bm-rutas-extremos',
      type: 'circle',
      source: MARKERS_SOURCE,
      minzoom: 13,
      filter: ['in', ['get', 'tipo'], ['literal', ['inicio', 'fin']]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4.5, 19, 8],
        'circle-color': ['match', ['get', 'tipo'], 'inicio', START, END],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-opacity': opacity(selected, 1, 0.15),
        'circle-stroke-opacity': opacity(selected, 1, 0.15),
      },
    },
    {
      id: 'bm-rutas-marcadores-texto',
      type: 'symbol',
      source: MARKERS_SOURCE,
      minzoom: 14.5,
      filter: ['in', ['get', 'tipo'], ['literal', ['inicio', 'fin']]],
      layout: {
        'text-field': ['match', ['get', 'tipo'], 'inicio', 'Inicio', 'Fin'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 11,
        'text-anchor': 'bottom',
        'text-offset': [0, -1.3],
        'icon-image': ['match', ['get', 'tipo'], 'inicio', 'bm-pildora-inicio', 'bm-pildora-fin'],
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 7, 2, 7],
        'text-allow-overlap': true,
        'icon-allow-overlap': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-opacity': opacity(selected, 1, 0.2),
        'icon-opacity': opacity(selected, 1, 0.2),
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

/** Imágenes de las rutas: una insignia de sentido por ruta y las píldoras de inicio y fin. */
function addImages(map: MapLibreMap, data: RouteMapData) {
  const codes = new Map<string, string>();
  for (const feature of data.trazos.features) {
    const code = String(feature.properties?.ruta ?? '');
    if (code) codes.set(code, routeColor(code, String(feature.properties?.color ?? FALLBACK)));
  }
  for (const [code, color] of codes) {
    const id = `bm-flecha-${code}`;
    if (!map.hasImage(id)) map.addImage(id, arrowBadge(color), { pixelRatio: 2 });
  }
  if (!map.hasImage('bm-pildora-inicio'))
    map.addImage('bm-pildora-inicio', pill(START), PILL_OPTIONS);
  if (!map.hasImage('bm-pildora-fin')) map.addImage('bm-pildora-fin', pill(END), PILL_OPTIONS);
}

/** Añade fuentes, imágenes y capas de rutas (una sola vez por mapa). */
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
  addImages(map, data);
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
  addImages(map, data);
  (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData(data.trazos);
  (map.getSource(ARROWS_SOURCE) as GeoJSONSource | undefined)?.setData(data.flechas);
  (map.getSource(MARKERS_SOURCE) as GeoJSONSource | undefined)?.setData(data.marcadores);
}
