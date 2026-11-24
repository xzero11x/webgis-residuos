import type { Map as MapLibreMap } from 'maplibre-gl';
import { Box, Crosshair, Maximize2, Minus, Orbit, PenLine, Plus, Route } from 'lucide-react';
import type { MapView } from '../types';
import { CENTER, URBAN_EXTENT } from '../config';

// Controles pequeños: zoom, centrar en Bagua, extensión urbana, rutas, vistas 2.5D/3D y correcciones.
export function MapControls({
  map,
  view,
  heightsAvailable,
  routesOn,
  canEdit = false,
  correctionsOn = false,
  onView,
  onToggleRoutes,
  onToggleCorrections,
}: {
  map: MapLibreMap | null;
  view: MapView;
  heightsAvailable: number;
  routesOn: boolean;
  canEdit?: boolean;
  correctionsOn?: boolean;
  onView: (view: MapView) => void;
  onToggleRoutes: () => void;
  onToggleCorrections?: () => void;
}) {
  const disabled = !map;
  const no3d = heightsAvailable === 0;
  return (
    <div className="bm-controls" role="toolbar" aria-label="Navegación del mapa">
      <button
        type="button"
        aria-label="Acercar"
        title="Acercar"
        disabled={disabled}
        onClick={() => map?.zoomIn({ duration: 350 })}
      >
        <Plus size={18} />
      </button>
      <button
        type="button"
        aria-label="Alejar"
        title="Alejar"
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
        aria-pressed={view === '2.5d'}
        aria-label={no3d ? 'Vista 2.5D no disponible: no hay alturas disponibles' : 'Vista 2.5D'}
        title={
          no3d
            ? 'No hay alturas disponibles para los edificios de Bagua.'
            : `Vista 2.5D · inclinación fija, se puede girar (${heightsAvailable} edificios con altura)`
        }
        disabled={disabled || no3d}
        onClick={() => onView(view === '2.5d' ? '2d' : '2.5d')}
      >
        <Box size={16} />
        <span>2.5D</span>
      </button>
      <button
        type="button"
        className="bm-controls-3d"
        data-testid="bm-modo-3d-libre"
        aria-pressed={view === '3d'}
        aria-label={no3d ? 'Vista 3D no disponible: no hay alturas disponibles' : 'Vista 3D libre'}
        title={
          no3d
            ? 'No hay alturas disponibles para los edificios de Bagua.'
            : 'Vista 3D libre · clic derecho o Ctrl + arrastrar para girar e inclinar'
        }
        disabled={disabled || no3d}
        onClick={() => onView(view === '3d' ? '2d' : '3d')}
      >
        <Orbit size={16} />
        <span>3D</span>
      </button>
      {canEdit && (
        <>
          <span className="bm-controls-sep" aria-hidden="true" />
          <button
            type="button"
            className="bm-controls-3d"
            data-testid="bm-corregir-boton"
            aria-pressed={correctionsOn}
            aria-label="Corregir el mapa"
            title="Corregir el mapa: ocultar lo que no existe, mover lugares o agregar edificaciones"
            onClick={onToggleCorrections}
          >
            <PenLine size={16} />
            <span>Corregir</span>
          </button>
        </>
      )}
    </div>
  );
}
