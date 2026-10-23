import { env } from '@/config/env';

// Configuración propia de BAGUA MASTER. Coordenadas de scripts/bagua-master/ambito.json.
export const BAGUA_MASTER_ENABLED = env.VITE_BAGUA_MASTER_ENABLED === 'true';
export const OVERTURE_VERSION = '2026-09-23.1';
export const API_BASE = `${env.VITE_API_BASE_URL.replace(/\/$/, '')}/bagua-master`;

/** Ventana urbana de Bagua Capital (no es un límite oficial). */
export const URBAN_EXTENT: [[number, number], [number, number]] = [
  [-78.575, -5.69],
  [-78.49, -5.6],
];
/** Área de descarga de Overture: límite de navegación del visor. */
export const DOWNLOAD_EXTENT: [[number, number], [number, number]] = [
  [-78.585, -5.7],
  [-78.48, -5.59],
];
export const CENTER: [number, number] = [-78.5367, -5.6378];
export const INITIAL_ZOOM = 15.6;
export const MIN_ZOOM = 12;
export const MAX_ZOOM = 20;

/** URL absoluta en el mismo origen (MapLibre y PMTiles la necesitan completa). */
export function sameOrigin(path: string) {
  return new URL(path, window.location.origin).toString();
}
/** Revisión de las teselas: cambia el URL para que el navegador no reutilice una copia anterior. */
export const TILES_REVISION = '2026-10-20-nombres-dwg';
export const TILES_URL = () =>
  `pmtiles://${sameOrigin(`${API_BASE}/teselas/bagua-master.pmtiles`)}?v=${TILES_REVISION}`;
export const GLYPHS_URL = () => `${sameOrigin(`${API_BASE}/fuentes`)}/{fontstack}/{range}.pbf`;

export const ATTRIBUTION =
  '<a href="https://overturemaps.org" target="_blank" rel="noreferrer">© Overture Maps Foundation</a> ' +
  `(${OVERTURE_VERSION}) · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> (ODbL) · ` +
  'Noto Sans (OFL)';
