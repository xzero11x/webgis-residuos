import { useCallback, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import './bagua-master.css';
import { MapControls } from './components/map-controls';
import { InfoPanel } from './components/info-panel';
import { RoutesPanel } from './components/routes-panel';
import { SearchBox } from './components/search-box';
import { OVERTURE_VERSION } from './config';
import {
  useBaguaMasterRouteMap,
  useBaguaMasterHeights,
  useBaguaMasterRoutes,
  useBaguaMasterSummary,
} from './hooks/use-bagua-master';
import { BaguaMasterLayout } from './layout/bagua-master-layout';
import { MAP_THEMES, THEME_NAMES, type MapTheme } from './map/themes';
import { BaguaMasterMap } from './map/bagua-master-map';
import type { SearchResult, Selection } from './types';

// Página del módulo BAGUA MASTER (/bagua-master). Se carga de forma diferida y no depende
// de ningún componente, estado ni consulta del mapa municipal.
export function BaguaMasterPage() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [theme, setTheme] = useState<MapTheme>('positron');
  const [mode3d, setMode3d] = useState(false);
  const [showSimulated, setShowSimulated] = useState(true);
  const [failed, setFailed] = useState(false);
  const [routesOn, setRoutesOn] = useState(false);
  const [routeCode, setRouteCode] = useState('');
  const summary = useBaguaMasterSummary();
  const heights =
    (summary.data?.alturas.conAltura ?? 0) +
    (summary.data?.alturas.conEstimacion ?? 0) +
    (summary.data?.alturas.conSimulacion ?? 0);
  const heightMap = useBaguaMasterHeights(mode3d);
  // Las rutas se piden solo al activarlas: abrir BAGUA MASTER no cuesta nada extra.
  const routeList = useBaguaMasterRoutes(routesOn);
  const routeMap = useBaguaMasterRouteMap(routesOn);

  const selectRoute = useCallback(
    (code: string) => {
      setRouteCode(code);
      if (!code) return;
      setSelection(null);
      const route = routeList.data?.rutas.find((r) => r.codigo === code);
      if (!map || !route) return;
      const narrow = window.matchMedia('(max-width: 767px)').matches;
      map.fitBounds(
        [
          [route.bbox[0], route.bbox[1]],
          [route.bbox[2], route.bbox[3]],
        ],
        {
          padding: narrow
            ? { top: 70, right: 56, bottom: Math.round(window.innerHeight * 0.5), left: 24 }
            : { top: 60, right: 80, bottom: 60, left: 380 },
          maxZoom: 17,
          duration: 900,
          essential: true,
        },
      );
    },
    [map, routeList.data],
  );
  const toggleRoutes = useCallback(() => {
    setRoutesOn((on) => !on);
    setRouteCode('');
  }, []);
  // Con un elemento de Overture seleccionado se ve su ficha; las rutas siguen dibujadas.
  const selectElement = useCallback((next: Selection | null) => {
    setSelection(next);
  }, []);

  const pick = useCallback(
    (result: SearchResult) => {
      setSelection({ tabla: result.tabla, id: result.id });
      map?.flyTo({
        center: result.geometria.coordinates,
        zoom: 17.5,
        duration: 900,
        essential: true,
      });
    },
    [map],
  );
  const onFailure = useCallback(() => setFailed(true), []);

  return (
    <BaguaMasterLayout search={<SearchBox onPick={pick} />}>
      <section className="bm-stage" aria-label="Mapa urbano de Bagua">
        <BaguaMasterMap
          selection={selection}
          mode3d={mode3d}
          theme={theme}
          heights={heightMap.data}
          showSimulated={showSimulated}
          routes={{ visible: routesOn, selected: routeCode, data: routeMap.data }}
          onSelectRoute={selectRoute}
          onSelect={selectElement}
          onMap={setMap}
          onFailure={onFailure}
        />
        <MapControls
          map={map}
          mode3d={mode3d}
          heightsAvailable={heights}
          routesOn={routesOn}
          onToggle3d={() => setMode3d((value) => !value)}
          onToggleRoutes={toggleRoutes}
        />
        <div className="bm-style-toolbar" role="toolbar" aria-label="Estilo del mapa">
          {THEME_NAMES.map((name) => (
            <button
              type="button"
              key={name}
              aria-pressed={theme === name}
              onClick={() => setTheme(name)}
            >
              {MAP_THEMES[name].label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={mode3d}
            disabled={!map || heights === 0}
            title="Activar o desactivar la vista 2.5D"
            onClick={() => setMode3d((value) => !value)}
          >
            3D
          </button>
        </div>
        <p className="bm-badge" data-testid="bm-version">
          Overture Maps {summary.data?.version?.overture ?? OVERTURE_VERSION}
        </p>
        {mode3d && (
          <div className="bm-height-notice" role="status">
            {heightMap.isError ? (
              <>
                No se pudieron cargar las alturas.{' '}
                <button type="button" onClick={() => void heightMap.refetch()}>
                  Reintentar
                </button>
              </>
            ) : heightMap.isLoading ? (
              'Cargando alturas…'
            ) : (
              <>
                {(summary.data?.alturas.fuentesEstimacion ?? []).map((source) => (
                  <span className="bm-height-observed" key={source.fuente}>
                    {source.fuente.includes('Google') ? 'Google' : source.fuente} {source.anio}:{' '}
                    {source.total.toLocaleString('es-PE')}
                  </span>
                ))}
                <label className="bm-height-simulated">
                  <input
                    type="checkbox"
                    checked={showSimulated}
                    onChange={(event) => setShowSimulated(event.target.checked)}
                  />
                  Mostrar simuladas: {summary.data?.alturas.conSimulacion?.toLocaleString('es-PE')}
                </label>
                Simuladas = modelo visual, no alturas observadas. Selecciona un edificio para ver su
                origen.
              </>
            )}
          </div>
        )}
        {failed && (
          <div className="bm-failure" role="alert">
            No se pudo cargar la cartografía de BAGUA MASTER. El resto de la aplicación sigue
            disponible.
          </div>
        )}
        {routesOn && !selection && (
          <RoutesPanel
            routes={routeList.data}
            loading={routeList.isLoading}
            failed={routeList.isError || routeMap.isError}
            selected={routeCode}
            onSelect={selectRoute}
            onClose={toggleRoutes}
          />
        )}
        {selection && (
          <InfoPanel
            key={`${selection.tabla}-${selection.id}`}
            selection={selection}
            onClose={() => setSelection(null)}
          />
        )}
      </section>
    </BaguaMasterLayout>
  );
}

export { BaguaMasterPage as Component };
