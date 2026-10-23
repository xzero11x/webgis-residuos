import type { Map as MapLibreMap } from 'maplibre-gl';
import { Box, Crosshair, Maximize2, Minus, Plus, Route } from 'lucide-react';
import { CENTER, URBAN_EXTENT } from '../config';

// Controles pequeños: zoom, centrar en Bagua, extensión urbana y 2D/2.5D.
export function MapControls({
  map,
  mode3d,
  heightsAvailable,
  routesOn,
  onToggle3d,
  onToggleRoutes,
}: {
  map: MapLibreMap | null;
  mode3d: boolean;
  heightsAvailable: number;
  routesOn: boolean;
  onToggle3d: () => void;
  onToggleRoutes: () => void;
}) {
  const disabled = !map;
  const no3d = heightsAvailable === 0;
  return (
    <div className="bm-controls" role="toolbar" aria-label="Navegación del mapa">
      <button
        type="button"
        aria-label="Acercar"
        disabled={disabled}
        onClick={() => map?.zoomIn({ duration: 350 })}
      >
        <Plus size={18} />
      </button>
      <button
        type="button"
        aria-label="Alejar"
        disabled={disabled}
        onClick={() => map?.zoomOut({ duration: 350 })}
      >
        <Minus size={18} />
      </button>
      <span className="bm-controls-sep" aria-hidden="true" />
      <button
        type="button"
        aria-label="Centrar en Bagua"
        title="Centrar en Bagua"
        disabled={disabled}
        onClick={() => map?.flyTo({ center: CENTER, zoom: 16.2, duration: 900, essential: true })}
      >
        <Crosshair size={18} />
      </button>
      <button
        type="button"
        aria-label="Ver la extensión urbana"
        title="Ver la extensión urbana"
        disabled={disabled}
        onClick={() => map?.fitBounds(URBAN_EXTENT, { padding: 24, duration: 900 })}
      >
        <Maximize2 size={17} />
      </button>
      <span className="bm-controls-sep" aria-hidden="true" />
      <button
        type="button"
        className="bm-controls-3d"
        data-testid="bm-rutas-boton"
        aria-pressed={routesOn}
        aria-label="Rutas de recolección"
        title="Rutas municipales de recolección"
        onClick={onToggleRoutes}
      >
        <Route size={16} />
        <span>Rutas</span>
      </button>
      <span className="bm-controls-sep" aria-hidden="true" />
      <button
        type="button"
        className="bm-controls-3d"
        data-testid="bm-modo-3d"
        aria-pressed={mode3d}
        aria-label={
          no3d ? 'Vista 2.5D no disponible: Overture no publica alturas para Bagua' : 'Vista 2.5D'
        }
        title={
          no3d
            ? 'Overture no publica alturas de edificios para Bagua en esta versión: no se inventan.'
            : `Vista 2.5D con las alturas publicadas por Overture (${heightsAvailable} edificios)`
        }
        disabled={disabled || no3d}
        onClick={onToggle3d}
      >
        <Box size={16} />
        <span>{mode3d ? '2.5D' : '2D'}</span>
      </button>
    </div>
  );
}
