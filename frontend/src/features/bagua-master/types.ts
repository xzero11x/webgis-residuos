import type { FeatureCollection } from 'geojson';
// Tipos del módulo BAGUA MASTER (respuestas de /api/bagua-master).
export type BaguaMasterTable =
  | 'red_vial'
  | 'conector'
  | 'edificio'
  | 'edificio_complemento'
  | 'parte_edificio'
  | 'uso_suelo'
  | 'agua'
  | 'terreno'
  | 'lugar'
  | 'infraestructura';

export interface Selection {
  tabla: BaguaMasterTable;
  id: string;
}

export interface OvertureSource {
  dataset?: string | null;
  license?: string | null;
  property?: string | null;
  record_id?: string | null;
  update_time?: string | null;
  confidence?: number | null;
}

export interface BaguaMasterElement {
  tabla: BaguaMasterTable;
  id: string;
  tipo: string | null;
  subtipo: string | null;
  subclase: string | null;
  categoria: string | null;
  nombre: string | null;
  alturaM: number | null;
  numPisos: number | null;
  alturaSimulada: {
    alturaM: number;
    metodo: string;
    vecinos: number;
    referenciaM: number;
    ghslM: number | null;
  } | null;
  alturaEstimada: {
    alturaM: number;
    cobertura: number;
    muestras: number;
    fuente: string;
    fecha: string;
    fechaPrecision: 'dia' | 'anio';
    licencia: string;
    metodo: string;
  } | null;
  longitudM: number | null;
  areaM2: number | null;
  geometriaValida: boolean;
  /** Geometría GeoJSON del elemento (para ubicarlo y consultar su horario). */
  geometria?: unknown;
  atributos: Record<string, unknown>;
  fuentes: OvertureSource[];
  /** Solo `red_vial` sin nombre en Overture: nombre documental recuperado del DWG (conjunto independiente). */
  nombreComplementario?: ComplementaryName | null;
  /** Solo `edificio_complemento`: procedencia de la huella y de su altura. */
  complemento?: BuildingComplement | null;
  infraestructura?: {
    descripcion: string;
    horario: string;
    materiales: string[];
    sintetico: boolean;
  } | null;
}

export type ComplementConfidence = 'alta' | 'media' | 'baja';

export interface BuildingComplement {
  fuente: string;
  confianzaGeo: ComplementConfidence;
  confianzaValor: number | null;
  registroFuente: string | null;
  regularizacion: string;
  alturaM: number;
  origenAltura: 'google_temporal' | 'estimada_default' | 'dron_dsm';
  alturaCobertura: number | null;
  alturaMuestras: number | null;
  licencia: string;
  versionFusion: string;
}

export interface ComplementSummary {
  total: number;
  versionFusion: string | null;
  fuentes: {
    fuente: string;
    confianza: ComplementConfidence;
    licencia: string;
    total: number;
    alturaPorDefecto: number;
  }[];
}

export interface ComplementaryName {
  nombre: string;
  nombreDocumental: string;
  origen: string;
  nivel: 'texto' | 'continuidad';
  respaldoRpu: string;
  fuente: { archivo: string; sha256: string };
  aviso: string;
}

export interface BaguaMasterSummary {
  modulo: string;
  version: {
    overture: string;
    esquema: string;
    atribucion: string;
    extraccionUtc: string;
    importadoEn: string;
    paqueteSha256: string;
  } | null;
  conjuntos: { nombre: string; filas: number; geometriaInvalida: number }[];
  elementos: { tabla: string; total: number; invalidas: number }[];
  alturas: {
    edificios: number;
    conAltura: number;
    conPisos: number;
    conEstimacion: number;
    conSimulacion: number;
    fuentesEstimacion: { fuente: string; anio: number; total: number }[];
  };
  complemento?: ComplementSummary;
}

export interface SearchResult {
  tabla: BaguaMasterTable;
  id: string;
  tipo: string | null;
  nombre: string;
  geometria: { type: 'Point'; coordinates: [number, number] };
}

// Rutas municipales de recolección (fase 2). Trazados documentales, no operativos.
export type RouteStatus = 'georreferenciada' | 'revision';

export interface RouteSummary {
  codigo: string;
  nombre: string;
  color: string;
  estado: RouteStatus;
  fuenteArchivo: string;
  fuenteSha256: string;
  nota: string;
  advertencias: string[];
  sectores: string[];
  crs: string;
  segmentos: number;
  longitudTrazosM: number;
  significadoLongitud: string;
  horarioEstado: string;
  sentidoEstado: string;
  flechas: { recuperadas: number; dibujadas: number; no_verificadas: number; duplicadas: number };
  /** Archivos DWG de los que proceden los trazos, las flechas y los marcadores. */
  procedencia: { trazos: string; flechas: string[]; marcadores: string[] };
  /** oeste, sur, este, norte */
  bbox: [number, number, number, number];
}

export interface RoutesResponse {
  aviso: string | null;
  rutas: RouteSummary[];
}

export interface RouteMapData {
  trazos: FeatureCollection;
  flechas: FeatureCollection;
  marcadores: FeatureCollection;
}

/** Vista del mapa: plano, 2.5D (inclinación fija, con giro) o 3D libre (inclinación y giro). */
export type MapView = '2d' | '2.5d' | '3d';

/** Correcciones cartográficas locales vigentes, tal como las dibuja el mapa (sin autoría). */
export interface MapCorrections {
  ocultos: Record<'lugar' | 'edificio' | 'edificio_complemento', string[]>;
  lugaresMovidos: FeatureCollection;
  edificiosAgregados: FeatureCollection;
}

/** Corrección con autor y motivo (solo con sesión). */
export interface MapCorrectionEntry {
  id: string;
  tabla: 'lugar' | 'edificio' | 'edificio_complemento';
  elementoId: string | null;
  accion: 'ocultar' | 'mover' | 'agregar';
  nombre: string | null;
  motivo: string;
  creadoEn: string;
  autor: string;
  nombreElemento: string | null;
  punto: { type: 'Point'; coordinates: [number, number] } | null;
}

export type LngLat = [number, number];

/** Edición en curso sobre el mapa: ubicar un lugar o dibujar una edificación que falta. */
export type MapDrawing =
  | { tipo: 'mover'; elementoId: string; nombre: string; punto: LngLat | null }
  | { tipo: 'agregar'; puntos: LngLat[] };

export type ServiceKind = 'convencional' | 'organicos' | 'reciclables' | 'comercial';

/** Servicio que pasa por un punto, con su hora estimada de paso. */
export interface ServiceAtPoint {
  id: string;
  ruta: string;
  rutaNombre: string;
  color: string;
  servicio: ServiceKind;
  nombre: string;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  turno: string;
  operador: string;
  vehiculo?: string;
  distanciaM?: number;
  horaEstimada: string | null;
  base: 'plano' | 'recorrido';
}

/** Programación de una ruta. */
export interface ServiceProgram {
  id: string;
  ruta: string;
  rutaNombre: string;
  color: string;
  servicio: ServiceKind;
  nombre: string;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  turno: string;
  sectores: string[];
  vehiculo: string;
  operador: string;
  nota: string;
  sintetico: boolean;
  tiemposPlano: number;
}
