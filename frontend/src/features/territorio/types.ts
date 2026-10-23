import type { FeatureCollection, Polygon, Position } from 'geojson';
export type Vinculo = 'Propietario' | 'Ocupante' | 'Responsable' | 'Contribuyente' | 'Otro';
export interface Persona {
  nombre: string;
  vinculo: Vinculo;
}
export interface Asignacion {
  servicioId: string;
  rutaId: string | null;
}
export interface PredioInput {
  codigo: string;
  direccion: string;
  sectorId: string;
  observaciones: string;
  geometry: Polygon;
  personas: Persona[];
  servicios: Asignacion[];
}
export interface Predio extends PredioInput {
  id: string;
  sector: string;
  isDemo: boolean;
  version: number;
  areaM2: number;
  updatedAt: string;
  servicios: (Asignacion & {
    nombre: string;
    color: string;
    ruta: string | null;
    codigoRuta: string | null;
    horario: string | null;
    frecuencia: string | null;
  })[];
}
export interface Catalogos {
  servicios: { id: string; nombre: string; color: string }[];
  rutas: {
    id: string;
    codigo: string;
    nombre: string;
    servicioId: string;
    horario: string | null;
    frecuencia: string | null;
    isDemo: boolean;
  }[];
  sectores: { id: string; nombre: string }[];
}
export interface Filtros {
  q: string;
  servicio: string;
  ruta: string;
  sector: string;
}
export interface Layers {
  rutas: FeatureCollection;
  puntos: FeatureCollection;
  sectores: FeatureCollection;
}
export type LayerName =
  | 'predios'
  | 'rutas'
  | 'puntos'
  | 'sectores'
  | 'referencias'
  | 'anotaciones'
  | 'revision'
  | 'demo'
  | 'sentidos'
  | 'simbolos'
  | 'zonas'
  | 'horarios'
  | 'calles';
export type Visibility = Record<LayerName, boolean>;
// Second-pass DWG layers: Técnico only, off by default, review evidence.
export const SECOND_PASS_LAYERS = [
  { key: 'rutas-bloques', label: 'Trazos de bloques no insertados · por revisar' },
  { key: 'puntos-topograficos', label: 'Puntos topográficos · por revisar' },
  { key: 'manzanas', label: 'Manzanas y calles RPU · por revisar' },
  { key: 'toponimia', label: 'Toponimia CAD · por revisar' },
  { key: 'hojas-planos', label: 'Ventanas de hojas · por revisar' },
  { key: 'cotas', label: 'Cotas del dibujo' },
  { key: 'etiquetas-lote', label: 'Rótulos de lote · zoom alto' },
] as const;
export type SecondPassLayer = (typeof SECOND_PASS_LAYERS)[number]['key'];
export type SecondPassVisibility = Record<SecondPassLayer, boolean>;
export const SECOND_PASS_HIDDEN = Object.fromEntries(
  SECOND_PASS_LAYERS.map(({ key }) => [key, false]),
) as SecondPassVisibility;
export interface SecondPassSummary {
  checksum: string | null;
  importedAt: string | null;
  counts: {
    kind: SecondPassLayer;
    status: string;
    crsStatus: 'declarado' | 'adoptado' | 'provisional';
    total: number;
    invalid: number;
  }[];
  audit: {
    tomaque: {
      translation_m: { dE: number; dN: number };
      vertices_within_5cm: number;
      rms_within_5cm_m: number;
      psad56_expected_shift_m: { dE: number; dN: number };
    };
    blocks: {
      bloque: string;
      capa: string;
      aceptado: boolean;
      coincidencias_5cm: number;
      trazos_nuevos?: number;
    }[];
    withheldForPrivacy: Record<string, number>;
    pendingDecisions: string[];
  } | null;
}
/** Lot labels are requested only from this zoom, for the visible window. */
export const LOT_LABEL_MIN_ZOOM = 17;
export interface MapView {
  bbox: [number, number, number, number];
  zoom: number;
}
export interface MapSelection {
  kind: 'ruta' | 'punto' | 'sector' | 'referencia' | 'segunda' | 'territorio';
  properties: Record<string, string>;
}
export const BAGUA_BOUNDS: [[number, number], [number, number]] = [
  [-78.575, -5.69],
  [-78.49, -5.6],
];
export const BAGUA_CENTER: [number, number] = [-78.5367, -5.6378];
export const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };
export function selectionProperties(properties: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
    ]),
  );
}
export function closePolygon(points: Position[]): Polygon {
  return { type: 'Polygon', coordinates: [[...points, points[0]!]] };
}

// Territorio unificado: agrupaciones de capas. Operativo muestra solo las de lectura general;
// el resto es de revisión técnica y se activa en Técnico.
export const TERRITORIO_GROUPS = [
  { key: 'manzanas', label: 'Manzanas', kinds: ['manzana'], minZoom: 15, operativo: true },
  { key: 'calles', label: 'Calles', kinds: ['calle'], minZoom: 15.5, operativo: true },
  { key: 'sectores', label: 'Sectores', kinds: ['sector'], minZoom: 13, operativo: true },
  {
    key: 'lotes',
    label: 'Lotes y viviendas · zoom alto',
    kinds: ['lote', 'vivienda'],
    minZoom: 17,
    operativo: false,
  },
  {
    key: 'puntos',
    label: 'Puntos topográficos',
    kinds: ['punto_topografico'],
    minZoom: 16,
    operativo: false,
  },
  {
    key: 'sombreados',
    label: 'Sombreados, hojas y cotas',
    kinds: ['sombreado', 'hoja', 'cota'],
    minZoom: 14,
    operativo: false,
  },
  {
    key: 'candidatos',
    label: 'Trazos candidatos de bloques · por revisar',
    kinds: ['ruta_candidata'],
    minZoom: 13,
    operativo: false,
  },
  {
    key: 'plano',
    label: 'Copias del plano de ubicación · precisión limitada',
    kinds: ['plano_ubicacion'],
    minZoom: 17,
    operativo: false,
  },
  {
    key: 'toponimia',
    label: 'Instituciones y cursos de agua',
    kinds: ['institucion', 'hidrografia'],
    minZoom: 14,
    operativo: false,
  },
] as const;
export type TerritorioGroupKey = (typeof TERRITORIO_GROUPS)[number]['key'];
export type TerritorioVisibility = Record<TerritorioGroupKey, boolean>;
export const TERRITORIO_DEFAULTS_OPERATIVO: TerritorioVisibility = Object.fromEntries(
  TERRITORIO_GROUPS.map((g) => [g.key, g.operativo]),
) as TerritorioVisibility;
export const TERRITORIO_DEFAULTS_TECNICO: TerritorioVisibility = Object.fromEntries(
  TERRITORIO_GROUPS.map((g) => [g.key, false]),
) as TerritorioVisibility;
// La extensión máxima de una consulta por área visible (el API la limita a 0,2° por lado).
export const TERRITORIO_MAX_SPAN = 0.2;

export interface TerritorioEntity {
  id: string;
  kind: string;
  nombre: string;
  nombreNormalizado: string | null;
  criterio: string;
  estado: { interpretacion: string; georreferencia: string; validacion: string };
  provisional: boolean;
  referencia: string;
  geometry: unknown;
  representaciones: {
    key: string;
    fuente: string;
    referencia: string | null;
    capa: string | null;
    entidadDxf: string | null;
    clase: string;
    tipoGeometria: string;
    crs: string;
    traslacion: [number, number];
    desviacionM: number;
    origen: string;
    texto: string | null;
  }[];
  atributos: {
    clave: string;
    valor: unknown;
    tipo: string;
    fuente: Record<string, unknown>;
    justificacion: string;
  }[];
  relaciones: {
    id: string;
    tipo: string;
    sentido: 'saliente' | 'entrante';
    entidad: { id: string; nombre: string; kind: string } | null;
    evidencia: Record<string, unknown>;
    regla: string;
  }[];
  conflictos: {
    id: string;
    propiedad: string;
    estado: string;
    valores: unknown[];
    evidencia: Record<string, unknown>;
  }[];
  excepciones: { id: string; causa: string; datos: Record<string, unknown>; nota: string }[];
  reglas: { id: string; version: number; descripcion: string }[];
  totales: { representaciones: number; atributos: number; conflictos: number };
}

export interface TerritorioSummary {
  checksum: string | null;
  importedAt: string | null;
  counts: { kind: string; entidades: number; provisionales: number; representaciones: number }[];
  representaciones: number;
  excepciones: { causa: string; total: number }[];
  conflictos: { propiedad: string; estado: string; total: number }[];
  relaciones: { tipo: string; total: number }[];
  identidad: {
    representaciones_verificadas: number;
    violaciones: number;
    desviacion_maxima_m: Record<string, number>;
    tolerancia_m: Record<string, number>;
  } | null;
  reglas: { id: string; version: number; descripcion: string }[];
}
