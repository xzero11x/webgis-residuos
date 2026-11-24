import type { FeatureCollection } from 'geojson';
import { apiGet } from '@/lib/api';
import type {
  BaguaMasterElement,
  BaguaMasterSummary,
  BaguaMasterTable,
  MapCorrections,
  ServiceAtPoint,
  ServiceProgram,
  RouteMapData,
  RoutesResponse,
  SearchResult,
} from '../types';

// Servicios de datos de BAGUA MASTER: solo /api/bagua-master.
export const baguaMasterApi = {
  heightMap: (signal?: AbortSignal) =>
    apiGet('/bagua-master/alturas/mapa', signal) as Promise<FeatureCollection>,
  complementMap: (signal?: AbortSignal) =>
    apiGet('/bagua-master/complemento/mapa', signal) as Promise<FeatureCollection>,
  servicePrograms: (signal?: AbortSignal) =>
    apiGet('/bagua-master/servicio/programacion', signal) as Promise<{
      programaciones: ServiceProgram[];
    }>,
  serviceAt: (lon: number, lat: number, signal?: AbortSignal) =>
    apiGet(
      `/bagua-master/servicio/consulta?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}`,
      signal,
    ) as Promise<{ servicios: ServiceAtPoint[] }>,
  infrastructure: (signal?: AbortSignal) =>
    apiGet('/bagua-master/infraestructura', signal) as Promise<FeatureCollection>,
  corrections: (signal?: AbortSignal) =>
    apiGet('/bagua-master/correcciones', signal) as Promise<MapCorrections>,
  summary: (signal?: AbortSignal) =>
    apiGet('/bagua-master/resumen', signal) as Promise<BaguaMasterSummary>,
  element: (tabla: BaguaMasterTable, id: string, signal?: AbortSignal) =>
    apiGet(
      `/bagua-master/elementos/${tabla}/${encodeURIComponent(id)}`,
      signal,
    ) as Promise<BaguaMasterElement>,
  routes: (signal?: AbortSignal) =>
    apiGet('/bagua-master/rutas', signal) as Promise<RoutesResponse>,
  routeMap: (signal?: AbortSignal) =>
    apiGet('/bagua-master/rutas/mapa', signal) as Promise<RouteMapData>,
  search: (q: string, signal?: AbortSignal) =>
    apiGet(`/bagua-master/buscar?q=${encodeURIComponent(q)}`, signal) as Promise<SearchResult[]>,
};
