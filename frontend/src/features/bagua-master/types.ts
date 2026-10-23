import type { FeatureCollection } from 'geojson';
// Tipos del módulo BAGUA MASTER (respuestas de /api/bagua-master).
export type BaguaMasterTable =
  | 'red_vial'
  | 'conector'
  | 'edificio'
  | 'parte_edificio'
  | 'uso_suelo'
  | 'agua'
  | 'terreno'
  | 'lugar';

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
  longitudM: number | null;
  areaM2: number | null;
  geometriaValida: boolean;
  atributos: Record<string, unknown>;
  fuentes: OvertureSource[];
  /** Solo `red_vial` sin nombre en Overture: nombre documental recuperado del DWG (conjunto independiente). */
  nombreComplementario?: ComplementaryName | null;
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
  alturas: { edificios: number; conAltura: number; conPisos: number };
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
