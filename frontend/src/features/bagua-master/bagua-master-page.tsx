import { UnitReference } from './components/unit-reference';
import { ExploreViews } from './components/explore-views';
import { WorkspaceEdits } from '@/features/gestion/workspace-edits';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PredioReference } from './components/predio-reference';
import { PersonReference } from './components/person-reference';
import { SpatialReview } from './components/spatial-review';
import { ExploreWelcome } from '@/features/product/welcome';
import { legacyWorkTarget } from '@/features/product/legacy';
import '@/features/gestion/gestion.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import './bagua-master.css';
import { MapControls } from './components/map-controls';
import { InfoPanel } from './components/info-panel';
import { RoutesPanel } from './components/routes-panel';
import { StylePicker } from './components/style-picker';
import { CorrectionsPanel, DrawBar } from './components/map-corrections';
import { useCanEditMap, useMapCorrections } from './hooks/use-map-corrections';
import { OVERTURE_VERSION } from './config';
import {
  useBaguaMasterRouteMap,
  useBaguaMasterComplement,
  useBaguaMasterHeights,
  useInfrastructure,
  useBaguaMasterRoutes,
  useBaguaMasterSummary,
} from './hooks/use-bagua-master';
import { DEFAULT_THEME, type MapTheme } from './map/themes';
import { BaguaMasterMap } from './map/bagua-master-map';
import type { BaguaMasterTable, LngLat, MapDrawing, MapView, Selection } from './types';

// Página del módulo BAGUA MASTER (/bagua-master). Se carga de forma diferida y no depende
// de ningún componente, estado ni consulta del mapa municipal.
export function BaguaMasterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const legacy = legacyWorkTarget(searchParams);
  const administrativeId = searchParams.get('predio');
  const personId = searchParams.get('persona');
  const spatialReview = !!administrativeId && searchParams.get('espacial') === 'revision';
  const spatialBuilding = searchParams.get('edificio_revision');
  const chooseSpatialBuilding = useCallback(
    (id: string) =>
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set('edificio_revision', id);
        return next;
      }),
    [setSearchParams],
  );
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [theme, setTheme] = useState<MapTheme>(DEFAULT_THEME);
  const [view, setView] = useState<MapView>('2d');
  const mode3d = view !== '2d';
  const [correctionsOn, setCorrectionsOn] = useState(false);
  const [drawing, setDrawing] = useState<MapDrawing | null>(null);
  const corrections = useMapCorrections();
  const canEdit = useCanEditMap();
  const [showSimulated, setShowSimulated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [routesOn, setRoutesOn] = useState(searchParams.get('explorar') === 'rutas');
  const [routeCode, setRouteCode] = useState('');
  const summary = useBaguaMasterSummary();
  const heights =
    (summary.data?.alturas.conAltura ?? 0) +
    (summary.data?.alturas.conEstimacion ?? 0) +
    (summary.data?.alturas.conSimulacion ?? 0);
  const heightMap = useBaguaMasterHeights(mode3d);
  const complementMap = useBaguaMasterComplement(true);
  const infrastructure = useInfrastructure();
  // Las rutas se piden solo al activarlas: abrir BAGUA MASTER no cuesta nada extra.
  const routeList = useBaguaMasterRoutes(routesOn);
  const routeMap = useBaguaMasterRouteMap(routesOn);

  const clearAdministrative = useCallback(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('predio');
        next.delete('unidad');
        next.delete('ficha');
        next.delete('persona');
        next.delete('espacial');
        next.delete('edificio_revision');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const selectRoute = useCallback(
    (code: string) => {
      clearAdministrative();
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
    [map, routeList.data, clearAdministrative],
  );
  const toggleRoutes = useCallback(() => {
    clearAdministrative();
    setRoutesOn((on) => !on);
    setRouteCode('');
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('explorar', routesOn ? 'territorio' : 'rutas');
      return next;
    });
  }, [clearAdministrative, routesOn, setSearchParams]);
  // Con un elemento de Overture seleccionado se ve su ficha; las rutas siguen dibujadas.
  const selectElement = useCallback(
    (next: Selection | null) => {
      if (spatialReview) {
        if (next?.tabla === 'edificio') chooseSpatialBuilding(next.id);
        return;
      }
      if (next) clearAdministrative();
      setSelection(next);
    },
    [clearAdministrative, spatialReview, chooseSpatialBuilding],
  );

  // Entradas desde la búsqueda universal: se ejecutan una vez y se retiran del URL.
  const placeIntent = searchParams.get('lugar');
  const routeIntent = searchParams.get('ruta');
  useEffect(() => {
    if (!map || !placeIntent) return;
    const [tabla, id] = placeIntent.split(':');
    const x = Number(searchParams.get('x'));
    const y = Number(searchParams.get('y'));
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        [
          'lugar',
          'x',
          'y',
          'predio',
          'unidad',
          'ficha',
          'persona',
          'espacial',
          'edificio_revision',
        ].forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
    if (!tabla || !id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume una entrada de URL de un solo uso y mueve el mapa
    setSelection({ tabla: tabla as BaguaMasterTable, id });
    if (Number.isFinite(x) && Number.isFinite(y))
      map.flyTo({ center: [x, y], zoom: 17.5, duration: 900, essential: true });
  }, [map, placeIntent, searchParams, setSearchParams]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la ruta pedida desde la búsqueda abre el panel de rutas
    if (routeIntent) setRoutesOn(true);
  }, [routeIntent]);
  useEffect(() => {
    if (!routeIntent || !map || !routeList.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selecciona la ruta pedida y retira la entrada del URL
    selectRoute(routeIntent);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('ruta');
        return next;
      },
      { replace: true },
    );
  }, [routeIntent, map, routeList.data, selectRoute, setSearchParams]);
  const onFailure = useCallback(() => setFailed(true), []);
  // Edición del mapa: cada clic ubica el lugar o agrega una esquina; Escape la cancela.
  const onDrawClick = useCallback(
    (point: LngLat) =>
      setDrawing((current) =>
        current?.tipo === 'mover'
          ? { ...current, punto: point }
          : current?.tipo === 'agregar'
            ? { ...current, puntos: [...current.puntos, point] }
            : current,
      ),
    [],
  );
  useEffect(() => {
    if (!drawing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing]);
  const relocated = new Set(
    (corrections.data?.lugaresMovidos.features ?? []).map((f) => String(f.properties?.id)),
  );

  if (legacy) return <Navigate to={legacy} replace />;

  return (
    <>
      <div className="bm-map-workspace">
        <section className="bm-stage" aria-label="Mapa urbano de Bagua">
          <BaguaMasterMap
            selection={selection}
            view={view}
            theme={theme}
            heights={heightMap.data}
            showSimulated={showSimulated}
            complement={complementMap.data}
            corrections={corrections.data}
            infrastructure={infrastructure.data}
            drawing={drawing}
            onDrawClick={onDrawClick}
            routes={{ visible: routesOn, selected: routeCode, data: routeMap.data }}
            onSelectRoute={selectRoute}
            onSelect={selectElement}
            onMap={setMap}
            onFailure={onFailure}
          />
          <MapControls
            map={map}
            view={view}
            heightsAvailable={heights}
            routesOn={routesOn}
            canEdit={canEdit}
            correctionsOn={correctionsOn}
            onView={setView}
            onToggleRoutes={toggleRoutes}
            onToggleCorrections={() => {
              setCorrectionsOn((on) => !on);
              setDrawing(null);
              setSelection(null);
            }}
          />
          <StylePicker theme={theme} onChange={setTheme} />
          <ExploreViews
            routesOn={routesOn}
            onRoutes={toggleRoutes}
            onExplore={() => setSelection(null)}
          />
          <p className="bm-badge" data-testid="bm-version">
            Overture Maps {summary.data?.version?.overture ?? OVERTURE_VERSION}
          </p>
          {mode3d && (
            <details className="bm-height-notice" open={heightMap.isError || undefined}>
              <summary>
                {view === '3d' ? 'Vista 3D libre' : 'Vista 2.5D'} · origen de las alturas
              </summary>
              {view === '3d' && (
                <span className="bm-height-observed">
                  Gira e inclina con clic derecho o Ctrl + arrastrar; en pantalla táctil, con dos
                  dedos.
                </span>
              )}
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
                    Mostrar simuladas:{' '}
                    {summary.data?.alturas.conSimulacion?.toLocaleString('es-PE')}
                  </label>
                  Simuladas = modelo visual, no alturas observadas. Selecciona un edificio para ver
                  su origen.
                </>
              )}
            </details>
          )}
          {failed && (
            <div className="bm-failure" role="alert">
              No se pudo cargar la cartografía de BAGUA MASTER. El resto de la aplicación sigue
              disponible.
            </div>
          )}
          {correctionsOn && !selection && !administrativeId && !personId && (
            <CorrectionsPanel
              map={map}
              onClose={() => {
                setCorrectionsOn(false);
                setDrawing(null);
              }}
              onAddBuilding={() => setDrawing({ tipo: 'agregar', puntos: [] })}
            />
          )}
          {drawing && (
            <DrawBar
              key={drawing.tipo}
              drawing={drawing}
              onUndoPoint={() =>
                setDrawing((current) =>
                  current?.tipo === 'agregar'
                    ? { ...current, puntos: current.puntos.slice(0, -1) }
                    : current,
                )
              }
              onCancel={() => setDrawing(null)}
              onSaved={() => setDrawing(null)}
            />
          )}
          {routesOn && !correctionsOn && !selection && !administrativeId && !personId && (
            <RoutesPanel
              routes={routeList.data}
              loading={routeList.isLoading}
              failed={routeList.isError || routeMap.isError}
              selected={routeCode}
              onSelect={selectRoute}
              onClose={toggleRoutes}
            />
          )}
          {selection && !administrativeId && !personId && (
            <InfoPanel
              key={`${selection.tabla}-${selection.id}`}
              selection={selection}
              onClose={() => setSelection(null)}
              canEdit={canEdit}
              relocated={selection.tabla === 'lugar' && relocated.has(selection.id)}
              onMove={(nombre) =>
                setDrawing({ tipo: 'mover', elementoId: selection.id, nombre, punto: null })
              }
            />
          )}
        </section>
        {!administrativeId && !personId && !selection && !routesOn && !correctionsOn && (
          <ExploreWelcome />
        )}
        {administrativeId && searchParams.get('unidad') && !spatialReview && (
          <UnitReference predio={administrativeId} id={searchParams.get('unidad')!} />
        )}
        {administrativeId && !searchParams.get('unidad') && !spatialReview && (
          <PredioReference
            key={administrativeId}
            id={administrativeId}
            map={map}
            onClose={() => {
              clearAdministrative();
              document.getElementById('bm-work-search')?.focus();
            }}
          />
        )}
        {administrativeId && spatialReview && (
          <WorkspaceEdits>
            <SpatialReview
              key={administrativeId}
              id={administrativeId}
              map={map}
              selected={spatialBuilding}
              onSelect={chooseSpatialBuilding}
              onClose={() => {
                setSearchParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.delete('espacial');
                  next.delete('edificio_revision');
                  return next;
                });
              }}
            />
          </WorkspaceEdits>
        )}
        {personId && (
          <PersonReference
            key={personId}
            id={personId}
            onClose={clearAdministrative}
            onPredio={(id) =>
              setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.delete('persona');
                next.set('predio', id);
                next.delete('unidad');
                next.delete('edificio_revision');
                return next;
              })
            }
          />
        )}
      </div>
    </>
  );
}

export { BaguaMasterPage as Component };
