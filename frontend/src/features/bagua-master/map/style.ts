import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { MAP_THEMES, type MapTheme } from './themes';
import { ATTRIBUTION, GLYPHS_URL, MAX_ZOOM, TILES_URL } from '../config';

// Estilo cartográfico propio de BAGUA MASTER. Una sola fuente estructural: las PMTiles de
// Overture 2026-09-23.1 servidas por /api/bagua-master. Sin estilos ni mapas base externos.
export const SOURCE = 'overture';

const zoomWidth = (base: number, z14: number, z18: number): ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.6],
  ['zoom'],
  12,
  base,
  14,
  z14,
  18,
  z18,
];

/*
 * Anchura de las vías. Overture no publica `width_rules` para Bagua (0 de 1 679 segmentos en
 * 2026-09-23.1), así que se usan anchuras CARTOGRÁFICAS por jerarquía: no son medidas reales.
 *
 * - Zoom 12–16: anchuras mínimas legibles en píxeles, crecientes.
 * - Zoom 16–20 (máximo del visor): la anchura equivale a un ancho visual fijo sobre el terreno,
 *   así que se duplica en pantalla con cada nivel, igual que edificios y manzanas.
 *   Píxeles = metros × 2^z / 77 892 (resolución de MapLibre a la latitud de Bagua, 5,64° S).
 * - Las avenidas de doble calzada (Héroes del Cenepa, Agropecuaria, Circunvalación, Vía de
 *   Evitamiento) son dos ejes paralelos separados ~10–12 m en Overture (mínimo 9,2 m). Cada
 *   calzada se dibuja más estrecha que esa separación para que el separador central se vea.
 */
const MAX_ZOOM_STYLE = MAX_ZOOM;
const PX_PER_M_Z16 = 2 ** 16 / 77_892;
const ROAD_HIERARCHY = [
  { clases: ['motorway', 'trunk', 'primary'], z12: 1.8, z14: 4.5, metros: 9, rango: 4 },
  { clases: ['secondary', 'tertiary'], z12: 1.3, z14: 3.4, metros: 7.5, rango: 3 },
  { clases: ['residential', 'unclassified', 'unknown'], z12: 0.6, z14: 2.2, metros: 6.5, rango: 2 },
  { clases: ['service', 'living_street'], z12: 0.4, z14: 1.3, metros: 4.5, rango: 1 },
  {
    clases: ['footway', 'path', 'track', 'steps', 'pedestrian', 'cycleway'],
    z12: 0.4,
    z14: 0.8,
    metros: 2,
    rango: 0,
  },
] as const;

const byClass = (value: (h: (typeof ROAD_HIERARCHY)[number]) => number): ExpressionSpecification =>
  [
    'match',
    ['get', 'clase'],
    ...ROAD_HIERARCHY.flatMap((h) => [[...h.clases], value(h)]),
    value(ROAD_HIERARCHY[2]),
  ] as unknown as ExpressionSpecification;

/** Anchura en píxeles por clase y zoom; `extra` añade un margen fijo (p. ej. el resaltado). */
const roadWidth = (extra = 0): ExpressionSpecification => [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  12,
  byClass((h) => h.z12 + extra),
  14,
  byClass((h) => h.z14 + extra),
  16,
  byClass((h) => h.metros * PX_PER_M_Z16 + extra),
  MAX_ZOOM_STYLE,
  byClass((h) => h.metros * PX_PER_M_Z16 * 2 ** (MAX_ZOOM_STYLE - 16) + extra),
];

/** Las vías de mayor jerarquía se dibujan encima en los cruces. */
const ROAD_SORT_KEY = byClass((h) => h.rango);

/** Borde de las vías: fino y proporcionado también a zoom alto. */
const ROAD_CASING: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12,
  0.4,
  16,
  1.2,
  MAX_ZOOM_STYLE,
  2.6,
];

const MAJOR_ROADS: ExpressionSpecification = [
  'match',
  ['get', 'clase'],
  [
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'residential',
    'unclassified',
    'service',
    'living_street',
    'unknown',
  ],
  true,
  false,
];
const PATHS: ExpressionSpecification = [
  'match',
  ['get', 'clase'],
  ['footway', 'path', 'track', 'steps', 'pedestrian', 'cycleway'],
  true,
  false,
];

export function buildStyle(theme: MapTheme = 'positron'): StyleSpecification {
  const PALETTE = MAP_THEMES[theme].palette;
  const roadColor: ExpressionSpecification = [
    'match',
    ['get', 'clase'],
    ['motorway', 'trunk'],
    PALETTE.troncal,
    'primary',
    PALETTE.principal,
    'secondary',
    PALETTE.secundaria,
    PALETTE.local,
  ];

  return {
    version: 8,
    name: `BAGUA MASTER · Overture · ${MAP_THEMES[theme].label}`,
    metadata: { 'bagua:base': 'Overture Maps', 'bagua:referencia-visual': MAP_THEMES[theme].label },
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.45, position: [1.5, 210, 40] },
    glyphs: GLYPHS_URL(),
    sources: {
      [SOURCE]: { type: 'vector', url: TILES_URL(), attribution: ATTRIBUTION },
      'bm-alturas': {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        attribution:
          'Alturas: © Google 2023 (CC BY 4.0) · © GlobalBuildingAtlas/TUM 2019 (CC BY-NC 4.0)',
      },
    },
    layers: [
      { id: 'bm-fondo', type: 'background', paint: { 'background-color': PALETTE.fondo } },
      {
        id: 'bm-terreno',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'terreno',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': PALETTE.terreno },
      },
      {
        id: 'bm-usos',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'usos_suelo',
        paint: {
          'fill-color': [
            'match',
            ['get', 'clase'],
            ['park', 'pitch', 'stadium', 'resort', 'grass', 'garden', 'recreation_ground'],
            PALETTE.verde,
            'cemetery',
            PALETTE.cementerio,
            ['school', 'college', 'university', 'kindergarten'],
            PALETTE.educacion,
            ['hospital', 'clinic'],
            PALETTE.salud,
            PALETTE.residencial,
          ],
          'fill-opacity': 0.95,
        },
      },
      {
        id: 'bm-usos-borde',
        type: 'line',
        source: SOURCE,
        'source-layer': 'usos_suelo',
        minzoom: 14,
        filter: ['match', ['get', 'clase'], ['park', 'pitch', 'stadium', 'resort'], true, false],
        paint: { 'line-color': PALETTE.verdeBorde, 'line-width': 1 },
      },
      {
        id: 'bm-agua-area',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'agua',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': PALETTE.agua },
      },
      {
        id: 'bm-agua-linea',
        type: 'line',
        source: SOURCE,
        'source-layer': 'agua',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PALETTE.aguaLinea, 'line-width': zoomWidth(1.5, 4, 14) },
      },
      {
        id: 'bm-edificios',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'edificios',
        minzoom: 13.5,
        paint: {
          'fill-color': [
            'case',
            ['>=', ['coalesce', ['get', 'area_m2'], 0], 300],
            PALETTE.edificioGrande,
            PALETTE.edificio,
          ],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 0.95],
        },
      },
      {
        id: 'bm-edificios-borde',
        type: 'line',
        source: SOURCE,
        'source-layer': 'edificios',
        minzoom: 15,
        paint: {
          'line-color': PALETTE.edificioBorde,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.2, 18, 0.65],
        },
      },
      {
        id: 'bm-senderos',
        type: 'line',
        source: SOURCE,
        'source-layer': 'red_vial',
        minzoom: 14,
        filter: PATHS,
        // Discontinuo a escala de ciudad; desde zoom 17, camino continuo y claro con su anchura
        // (unos guiones del ancho del sendero parecerían bloques).
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            ['zoom'],
            16.5,
            PALETTE.sendero,
            17,
            PALETTE.senderoClaro,
          ],
          'line-width': roadWidth(),
          'line-dasharray': ['step', ['zoom'], ['literal', [2, 1.5]], 17, ['literal', [1, 0]]],
        },
      },
      {
        id: 'bm-vias-borde',
        type: 'line',
        source: SOURCE,
        'source-layer': 'red_vial',
        filter: MAJOR_ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ROAD_SORT_KEY },
        paint: {
          'line-color': PALETTE.viaBorde,
          'line-gap-width': roadWidth(),
          'line-width': ROAD_CASING,
        },
      },
      {
        id: 'bm-vias',
        type: 'line',
        source: SOURCE,
        'source-layer': 'red_vial',
        filter: MAJOR_ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ROAD_SORT_KEY },
        paint: { 'line-color': roadColor, 'line-width': roadWidth() },
      },
      {
        id: 'bm-conectores',
        type: 'circle',
        source: SOURCE,
        'source-layer': 'conectores',
        minzoom: 17.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 17.5, 2.2, MAX_ZOOM_STYLE, 4.5],
          'circle-color': PALETTE.halo,
          'circle-stroke-color': PALETTE.viaBorde,
          'circle-stroke-width': 1.2,
        },
      },
      // 2.5D: solo edificios con altura publicada por Overture. Oculto por defecto.
      {
        id: 'bm-edificios-3d',
        type: 'fill-extrusion',
        source: SOURCE,
        'source-layer': 'edificios',
        minzoom: 15,
        filter: ['has', 'altura_m'],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': PALETTE.edificioGrande,
          'fill-extrusion-height': ['get', 'altura_m'],
          'fill-extrusion-opacity': 0.85,
        },
      },
      {
        id: 'bm-alturas-3d',
        type: 'fill-extrusion',
        source: 'bm-alturas',
        minzoom: 15,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-height': ['get', 'altura_m'],
          'fill-extrusion-base': 0,
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'tipo'], 'simulada'],
            PALETTE.simulada,
            [
              'interpolate',
              ['linear'],
              ['get', 'altura_m'],
              2,
              PALETTE.volumenBajo,
              8,
              PALETTE.volumenMedio,
              20,
              PALETTE.volumenAlto,
              40,
              PALETTE.volumenMaximo,
            ],
          ],
          'fill-extrusion-opacity': 0.95,
        },
      },
      {
        id: 'bm-alturas-seleccion',
        type: 'fill-extrusion',
        source: 'bm-alturas',
        minzoom: 15,
        filter: ['==', ['get', 'id'], ''],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-height': ['get', 'altura_m'],
          'fill-extrusion-color': PALETTE.seleccion,
          'fill-extrusion-opacity': 0.95,
        },
      },
      {
        id: 'bm-seleccion-area',
        type: 'line',
        source: SOURCE,
        'source-layer': 'edificios',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': PALETTE.seleccion, 'line-width': 3 },
      },
      {
        id: 'bm-seleccion-via',
        type: 'line',
        source: SOURCE,
        'source-layer': 'red_vial',
        filter: ['==', ['get', 'id'], ''],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': PALETTE.seleccion,
          'line-width': roadWidth(4),
          'line-opacity': 0.55,
        },
      },
      {
        id: 'bm-agua-texto',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'agua',
        filter: ['all', ['has', 'nombre'], ['==', ['geometry-type'], 'LineString']],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 12, 17, 16],
          'text-letter-spacing': 0.08,
        },
        paint: {
          'text-color': PALETTE.aguaTexto,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1.8,
        },
      },
      {
        id: 'bm-agua-texto-area',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'agua',
        minzoom: 15,
        filter: ['all', ['has', 'nombre'], ['==', ['geometry-type'], 'Polygon']],
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 12,
        },
        paint: {
          'text-color': PALETTE.aguaTexto,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1.8,
        },
      },
      /*
       * Nombres de calles. Salen de la capa auxiliar `calles_rotulo` (mismas líneas de Overture,
       * unidas por nombre solo para colocar el texto; `red_vial` no cambia). Overture parte cada
       * calle en tramos de unos 50–100 m y MapLibre solo coloca un rótulo de línea si el texto
       * cabe en un elemento, de modo que sobre `red_vial` la mayoría de las calles no recibía
       * rótulo. Las vías mayores se colocan primero (`symbol-sort-key`) y ganan las colisiones.
       * Solo hay rótulo donde Overture publica `names.primary`: no se inventan nombres.
       */
      {
        id: 'bm-calles-texto',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'calles_rotulo',
        minzoom: 14.5,
        filter: ['==', ['get', 'tipo'], 'calle'],
        layout: {
          'symbol-placement': 'line',
          'symbol-sort-key': ['*', -1, ['get', 'rango']],
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 10.5, 16, 12, 18, 14],
          'text-padding': 2,
          'symbol-spacing': 360,
          'text-max-angle': 45,
        },
        paint: {
          'text-color': PALETTE.texto,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1.2,
        },
      },
      /*
       * Designación de ruta (p. ej. «Ruta PE-5NC»). No es un nombre de calle: es el nombre de ruta
       * que Overture publica en `routes[].name` para tramos que no tienen `names.primary`. Se
       * dibuja en cursiva y color distintos para no confundirla con un nombre de calle.
       */
      {
        id: 'bm-rutas-texto',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'calles_rotulo',
        minzoom: 12.5,
        filter: ['==', ['get', 'tipo'], 'ruta'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 11, 16, 13, 18, 15],
          'text-letter-spacing': 0.05,
          'text-padding': 2,
          'symbol-spacing': 420,
          'text-max-angle': 45,
        },
        paint: {
          'text-color': PALETTE.rutaTexto,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 2.2,
        },
      },
      {
        id: 'bm-terreno-texto',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'terreno',
        filter: ['all', ['has', 'nombre'], ['==', ['geometry-type'], 'LineString']],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 12,
        },
        paint: {
          'text-color': PALETTE.textoSecundario,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'bm-lugares',
        type: 'circle',
        source: SOURCE,
        'source-layer': 'lugares',
        minzoom: 15.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 2, 18, 4],
          'circle-color': PALETTE.lugar,
          'circle-stroke-color': PALETTE.halo,
          'circle-stroke-width': 1.6,
        },
      },
      {
        id: 'bm-lugares-texto',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'lugares',
        minzoom: 16.5,
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 16.5, 10.5, 18, 12],
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 10,
          'text-optional': true,
        },
        paint: {
          'text-color': PALETTE.textoSecundario,
          'text-halo-color': PALETTE.halo,
          'text-halo-width': 1.8,
        },
      },
    ],
  };
}

/** Capas consultables al tocar el mapa, de la más específica a la más general, y su tabla en la API. */
export const SELECTABLE_LAYERS: {
  layer: string;
  tabla: 'lugar' | 'conector' | 'red_vial' | 'edificio' | 'agua' | 'uso_suelo' | 'terreno';
}[] = [
  { layer: 'bm-alturas-3d', tabla: 'edificio' },
  { layer: 'bm-lugares', tabla: 'lugar' },
  { layer: 'bm-conectores', tabla: 'conector' },
  { layer: 'bm-vias', tabla: 'red_vial' },
  { layer: 'bm-senderos', tabla: 'red_vial' },
  { layer: 'bm-edificios', tabla: 'edificio' },
  { layer: 'bm-agua-linea', tabla: 'agua' },
  { layer: 'bm-agua-area', tabla: 'agua' },
  { layer: 'bm-usos', tabla: 'uso_suelo' },
  { layer: 'bm-terreno', tabla: 'terreno' },
];
