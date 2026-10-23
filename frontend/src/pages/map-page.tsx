import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { Position } from 'geojson';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Layers3,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react';
import { MapViewport } from '@/components/map/map-viewport';
import { Button } from '@/components/ui/button';
import { TerritorialSearch } from '@/components/layout/territorial-search';
import {
  useCatalogos,
  useCadInventory,
  useCadReview,
  useCadReferences,
  useCartography,
  useLayers,
  usePredio,
  usePredios,
  useSecondPassLayers,
  useSecondPassSummary,
  useTerritorioLayers,
  savePredio,
  deletePredio,
} from '@/features/territorio/api';
import { PredioDetail } from '@/features/territorio/predio-detail';
import { RouteBrowser } from '@/features/territorio/route-browser';
import { CartographyLegend } from '@/features/territorio/cartography-legend';
import { MapFeatureDetail } from '@/features/territorio/map-feature-detail';
import { SecondPassDetail } from '@/features/territorio/second-pass-detail';
import { TerritorialDetail } from '@/features/territorio/territorial-detail';
import { SecondPassLegend } from '@/features/territorio/second-pass-legend';
import { PredioEditor } from '@/features/territorio/predio-editor';
import {
  closePolygon,
  LOT_LABEL_MIN_ZOOM,
  SECOND_PASS_HIDDEN,
  SECOND_PASS_LAYERS,
  TERRITORIO_DEFAULTS_OPERATIVO,
  TERRITORIO_GROUPS,
  TERRITORIO_MAX_SPAN,
  type TerritorioVisibility,
  type Filtros,
  type MapSelection,
  type MapView,
  type Predio,
  type PredioInput,
  type SecondPassVisibility,
  type Visibility,
} from '@/features/territorio/types';

interface EditorState {
  mode: 'draw' | 'form';
  input: PredioInput;
  existing?: Predio;
}
const emptyInput: PredioInput = {
  codigo: '',
  direccion: '',
  sectorId: '',
  observaciones: '',
  geometry: { type: 'Polygon', coordinates: [] },
  personas: [],
  servicios: [],
};
const initialVisibility: Visibility = {
  predios: false,
  rutas: true,
  puntos: true,
  sectores: false,
  referencias: false,
  anotaciones: false,
  revision: false,
  demo: false,
  sentidos: true,
  simbolos: true,
  calles: true,
  zonas: false,
  horarios: false,
};
/** Snap the visible window outwards so small pans reuse the cached lot labels. */
function lotLabelWindow(view: MapView | null): [number, number, number, number] | undefined {
  if (!view || view.zoom < LOT_LABEL_MIN_ZOOM) return undefined;
  const step = 0.002;
  const [w, s, e, n] = view.bbox;
  const window: [number, number, number, number] = [
    +(Math.floor(w / step) * step).toFixed(3),
    +(Math.floor(s / step) * step).toFixed(3),
    +(Math.ceil(e / step) * step).toFixed(3),
    +(Math.ceil(n / step) * step).toFixed(3),
  ];
  return window[2] - window[0] <= 0.03 && window[3] - window[1] <= 0.03 ? window : undefined;
}
function formatMeters(value: number) {
  return `${value.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m`;
}

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const selectionQuery = useRef<string | null>(null);
  const view = params.get('vista') === 'predios' ? 'predios' : 'rutas';
  const [debounced, setDebounced] = useState(q);
  const filters: Filtros = {
    q: debounced,
    servicio: params.get('servicio') || '',
    ruta: params.get('ruta') || '',
    sector: params.get('sector') || '',
  };
  const catalogos = useCatalogos();
  const predios = usePredios(filters);
  const layers = useLayers(filters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = usePredio(selectedId);
  const [visibility, setVisibility] = useState({
    ...initialVisibility,
    predios: view === 'predios',
  });
  const [technical, setTechnical] = useState(false);
  const cartography = useCartography();
  const [secondPassShown, setSecondPassShown] = useState<SecondPassVisibility>(SECOND_PASS_HIDDEN);
  const [mapView, setMapView] = useState<MapView | null>(null);
  const [territorioVis, setTerritorioVis] = useState<TerritorioVisibility>(
    TERRITORIO_DEFAULTS_OPERATIVO,
  );
  const [inspectCad, setInspectCad] = useState(false);
  const [cadFile, setCadFile] = useState('RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg');
  const [cadLayer, setCadLayer] = useState('COTAS');
  const cadInventory = useCadInventory(technical);
  const cadSource = cadInventory.data?.audit?.sources.find((s) => s.source === cadFile);
  const cadWindow = lotLabelWindow(mapView);
  const cadReview = useCadReview(cadFile, cadLayer, cadWindow, technical && inspectCad);
  const shownSecondPass = technical ? secondPassShown : SECOND_PASS_HIDDEN;
  const secondPass = useSecondPassLayers(shownSecondPass, lotLabelWindow(mapView));
  const secondPassSummary = useSecondPassSummary(Object.values(shownSecondPass).some(Boolean));
  // Una capa del territorio unificado solo aparece en su modo: las de revisión, en Técnico.
  const effectiveTerritorioVis = Object.fromEntries(
    TERRITORIO_GROUPS.map((g) => [g.key, territorioVis[g.key] && (technical || g.operativo)]),
  ) as TerritorioVisibility;
  const territorioBbox =
    mapView &&
    mapView.bbox[2] - mapView.bbox[0] <= TERRITORIO_MAX_SPAN &&
    mapView.bbox[3] - mapView.bbox[1] <= TERRITORIO_MAX_SPAN
      ? mapView.bbox
      : undefined;
  const territorioGroups = TERRITORIO_GROUPS.filter(
    (g) => effectiveTerritorioVis[g.key] && (mapView?.zoom ?? 0) >= g.minZoom,
  ).map((g) => g.key);
  const territorio = useTerritorioLayers(territorioGroups, territorioBbox);
  function changeMode(value: boolean) {
    setTechnical(value);
    setFeature(null);
    setTerritorioVis(TERRITORIO_DEFAULTS_OPERATIVO);
    // Second-pass review layers always start switched off.
    setSecondPassShown(SECOND_PASS_HIDDEN);
    setVisibility((v) => ({
      ...v,
      revision: value,
      referencias: false,
      anotaciones: false,
      zonas: false,
      horarios: false,
      demo: false,
      sectores: false,
    }));
  }
  // Las calles de primera pasada se ocultan cuando las calles unificadas están activas (sin rótulos duplicados).
  const effectiveVisibility = {
    ...visibility,
    calles: visibility.calles && !effectiveTerritorioVis.calles,
  };
  const references = useCadReferences('lote_cad', visibility.referencias);
  const annotations = useCadReferences('anotacion_ruta', visibility.anotaciones);
  const shownLayers = useMemo(
    () =>
      layers.data
        ? {
            ...layers.data,
            rutas: {
              ...layers.data.rutas,
              features: layers.data.rutas.features.filter(
                (r) =>
                  (!r.properties?.isDemo || visibility.demo) &&
                  (r.properties?.status !== 'revision' || visibility.revision),
              ),
            },
            puntos: {
              ...layers.data.puntos,
              features: layers.data.puntos.features.filter(
                (p) => !p.properties?.isDemo || visibility.demo,
              ),
            },
          }
        : undefined,
    [layers.data, visibility.demo, visibility.revision],
  );
  const [listOpen, setListOpen] = useState(() => window.innerWidth >= 768);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [feature, setFeature] = useState<MapSelection | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Position[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(q);
      if (q && selectionQuery.current !== q) {
        setSelectedId(null);
        setFeature(null);
        setListOpen(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: ({ input, existing }: { input: PredioInput; existing?: Predio }) =>
      savePredio(input, existing),
    onSuccess: (data) => {
      queryClient.setQueryData(['territorio', 'predio', data.id], data);
      void queryClient.invalidateQueries({ queryKey: ['territorio'] });
      setSelectedId(data.id);
      setEditor(null);
      setDraft([]);
      setParams({ vista: 'predios' });
      setMessage(`${data.codigo} guardado en PostGIS.`);
    },
  });
  const remove = useMutation({
    mutationFn: deletePredio,
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['territorio'] });
      setMessage('Predio eliminado.');
    },
  });
  function selectPredio(id: string) {
    if (editor) return;
    selectionQuery.current = q;
    setSelectedId(id);
    setFeature(null);
    setMessage('');
    remove.reset();
  }
  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name === 'servicio') next.delete('ruta');
    setParams(next);
    setSelectedId(null);
    setFeature(null);
  }
  function startNew() {
    save.reset();
    const next = new URLSearchParams(params);
    next.set('vista', 'predios');
    setVisibility((v) => ({ ...v, predios: true }));
    setParams(next);
    setSelectedId(null);
    setFeature(null);
    setDraft([]);
    setEditor({
      mode: 'draw',
      input: { ...emptyInput, sectorId: filters.sector || catalogos.data?.sectores[0]?.id || '' },
    });
    setMessage('');
  }
  function startEdit() {
    if (!selected.data) return;
    save.reset();
    const { codigo, direccion, sectorId, observaciones, geometry, personas, servicios } =
      selected.data;
    setEditor({
      mode: 'form',
      existing: selected.data,
      input: {
        codigo,
        direccion,
        sectorId,
        observaciones,
        geometry,
        personas,
        servicios: servicios.map(({ servicioId, rutaId }) => ({ servicioId, rutaId })),
      },
    });
  }
  const data = predios.data?.items || [];
  const activeFilters = [filters.servicio, filters.ruta, filters.sector].filter(Boolean).length;
  return (
    <section className="gis-page" aria-label="Vista territorial">
      <div className="gis-heading">
        <div>
          <h1>
            Vista territorial <span>Bagua, Amazonas</span>
          </h1>
        </div>
        <div className="map-mode-switch" role="group" aria-label="Modo del mapa">
          <button type="button" aria-pressed={!technical} onClick={() => changeMode(false)}>
            Operativo
          </button>
          <button type="button" aria-pressed={technical} onClick={() => changeMode(true)}>
            Técnico
          </button>
        </div>
      </div>
      <div className={`map-stage gis-stage ${feature ? 'has-feature' : ''}`}>
        <MapViewport
          predios={data}
          layers={shownLayers}
          references={references.data}
          annotations={annotations.data}
          cartography={cartography.data}
          cadReview={inspectCad && cadWindow ? cadReview.data : undefined}
          secondPass={secondPass.data}
          secondPassVisibility={shownSecondPass}
          territorio={territorio.data}
          territorioVisibility={effectiveTerritorioVis}
          onView={setMapView}
          technical={technical}
          focused={feature}
          visibility={effectiveVisibility}
          selected={selected.data}
          drawing={editor?.mode === 'draw'}
          draft={draft}
          onSelect={selectPredio}
          onFeature={(value) => {
            if (!editor) {
              selectionQuery.current = q;
              setFeature(value);
              setSelectedId(null);
            }
          }}
          onDraw={(point) =>
            setDraft((points) => (points.length < 249 ? [...points, point] : points))
          }
        />
        <div className={`map-tools-left ${editor ? 'is-editing' : ''}`}>
          <TerritorialSearch mobile />
          <div className="map-action-row">
            <Button size="sm" onClick={startNew} disabled={!!editor || !catalogos.data}>
              <Plus />
              Nuevo predio
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Filtros"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
              disabled={!!editor}
            >
              <SlidersHorizontal />
              {activeFilters > 0 ? activeFilters : 'Filtros'}
            </Button>
            <details className="layer-control">
              <summary aria-label="Capas del mapa">
                <Layers3 className="size-4" />
                <span>Capas</span>
              </summary>
              <div className="layer-menu">
                <p>{technical ? 'Capas técnicas' : 'Mostrar en el mapa'}</p>
                {(
                  [
                    ['predios', 'Predios'],
                    ['rutas', 'Rutas'],
                    ['sentidos', 'Flechas de sentido'],
                    ['simbolos', 'Inicio, fin y paradas del plano'],
                    ['calles', 'Nombres de calles CAD'],
                    ['zonas', 'Áreas de cobertura · por revisar'],
                    ['horarios', 'Horarios del plano · sin validar'],
                    ['puntos', 'Puntos de recolección'],
                    ['sectores', 'Sectores'],
                    ['referencias', 'Contornos CAD'],
                    ['anotaciones', 'Anotaciones del plano'],
                    ['revision', 'Trazados por revisar'],
                    ['demo', 'Rutas y puntos DEMO'],
                  ] as const
                )
                  .filter(
                    ([key]) =>
                      technical ||
                      ['predios', 'rutas', 'sentidos', 'simbolos', 'calles'].includes(key),
                  )
                  .map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={visibility[key]}
                        onChange={(event) => {
                          setVisibility((value) => ({ ...value, [key]: event.target.checked }));
                          if (!event.target.checked) setFeature(null);
                        }}
                      />
                      {label}
                      <span className={`legend-${key}`} />
                    </label>
                  ))}
                <fieldset className="territorio-menu">
                  <legend>Territorio unificado{technical ? '' : ' · principal'}</legend>
                  {TERRITORIO_GROUPS.filter((g) => technical || g.operativo).map((g) => (
                    <label key={g.key}>
                      <input
                        type="checkbox"
                        checked={territorioVis[g.key]}
                        onChange={(event) =>
                          setTerritorioVis((value) => ({ ...value, [g.key]: event.target.checked }))
                        }
                      />
                      {g.label}
                      <span className={`territorio-swatch swatch-${g.key}`} aria-hidden="true" />
                    </label>
                  ))}
                </fieldset>
                {technical && (
                  <fieldset className="second-pass-menu cad-inspector">
                    <legend>Explorar el dibujo original</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={inspectCad}
                        onChange={(e) => setInspectCad(e.target.checked)}
                      />
                      Ver geometrías por archivo y capa
                    </label>
                    {inspectCad && (
                      <>
                        <label>
                          Archivo DWG
                          <select
                            aria-label="Archivo DWG"
                            value={cadFile}
                            onChange={(e) => {
                              setCadFile(e.target.value);
                              setCadLayer(
                                cadInventory.data?.layers.find((l) => l.source === e.target.value)
                                  ?.layer || '',
                              );
                            }}
                          >
                            {[...new Set(cadInventory.data?.layers.map((l) => l.source))].map(
                              (s) => (
                                <option key={s}>{s}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label>
                          Capa CAD
                          <select
                            aria-label="Capa CAD"
                            value={cadLayer}
                            onChange={(e) => setCadLayer(e.target.value)}
                          >
                            {cadInventory.data?.layers
                              .filter((l) => l.source === cadFile)
                              .map((l) => (
                                <option key={l.layer} value={l.layer}>
                                  {l.layer} · {l.total}
                                </option>
                              ))}
                          </select>
                        </label>
                        <small>
                          Colores originales · geometrías sin clasificación operativa. Incluye capas
                          ocultas del DWG. Toca un elemento para ver su referencia.
                        </small>
                        {cadSource?.alignment && (
                          <p
                            className={
                              cadSource.crsStatus === 'adoptado'
                                ? 'source-notice'
                                : 'source-notice pending'
                            }
                          >
                            {cadSource.crsStatus === 'adoptado'
                              ? `CRS adoptado el ${cadSource.alignment.adopted}: PSAD 56 llevado al CAD de rutas`
                              : 'Posición provisional: PSAD 56 alineado al CAD de rutas'}{' '}
                            con una traslación medida de{' '}
                            {formatMeters(cadSource.alignment.translation_m.dE)} E y{' '}
                            {formatMeters(cadSource.alignment.translation_m.dN)} N (
                            {cadSource.alignment.vertices_within_5cm.toLocaleString('es-PE')}{' '}
                            vértices coinciden a menos de 5 cm).
                          </p>
                        )}
                        {cadSource?.crsStatus === 'pendiente' ? (
                          <p>
                            Coordenadas conservadas, CRS pendiente. No se superpone hasta verificar
                            su ubicación.
                          </p>
                        ) : !cadWindow ? (
                          <p>Acerca el mapa para consultar esta capa.</p>
                        ) : (
                          <p>
                            {cadReview.isFetching
                              ? 'Consultando…'
                              : `${cadReview.data?.features.length ?? 0} geometrías en esta ventana`}
                          </p>
                        )}
                        {cadReview.data?.truncated && (
                          <p>Hay más de 8.000 elementos. Acerca el mapa para verlos todos.</p>
                        )}
                        {(cadReview.isError || cadInventory.isError) && (
                          <p>
                            No se pudo cargar la revisión CAD. Comprueba la API y la importación.
                          </p>
                        )}
                      </>
                    )}
                  </fieldset>
                )}
                {technical && (
                  <fieldset className="second-pass-menu">
                    <legend>Segunda pasada DWG · solo lectura</legend>
                    {SECOND_PASS_LAYERS.map(({ key, label }) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={secondPassShown[key]}
                          onChange={(event) => {
                            setSecondPassShown((value) => ({
                              ...value,
                              [key]: event.target.checked,
                            }));
                            if (!event.target.checked && feature?.properties.kind === key)
                              setFeature(null);
                          }}
                        />
                        {label}
                        <span className={`second-pass-swatch swatch-${key}`} aria-hidden="true" />
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            </details>
          </div>
          {filtersOpen && !editor && (
            <div className="filters-card">
              <div className="flex items-center justify-between">
                <strong>{view === 'rutas' ? 'Filtrar rutas' : 'Filtrar predios'}</strong>
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    for (const key of ['servicio', 'ruta', 'sector']) next.delete(key);
                    setParams(next);
                    setSelectedId(null);
                  }}
                >
                  Limpiar
                </button>
              </div>
              <label>
                Servicio
                <select
                  aria-label="Filtrar por servicio"
                  value={filters.servicio}
                  onChange={(event) => setFilter('servicio', event.target.value)}
                >
                  <option value="">Todos los servicios</option>
                  {catalogos.data?.servicios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ruta
                <select
                  aria-label="Filtrar por ruta"
                  value={filters.ruta}
                  onChange={(event) => setFilter('ruta', event.target.value)}
                >
                  <option value="">Todas las rutas</option>
                  {catalogos.data?.rutas
                    .filter((item) => !filters.servicio || item.servicioId === filters.servicio)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Sector
                <select
                  aria-label="Filtrar por sector"
                  value={filters.sector}
                  onChange={(event) => setFilter('sector', event.target.value)}
                >
                  <option value="">Todos los sectores</option>
                  {catalogos.data?.sectores.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {!editor && (
            <div className="map-view-tabs" role="tablist" aria-label="Explorar información">
              {(['rutas', 'predios'] as const).map((value) => (
                <button
                  type="button"
                  role="tab"
                  key={value}
                  aria-selected={view === value}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('vista', value);
                    setVisibility((v) => ({ ...v, predios: value === 'predios' }));
                    next.delete('q');
                    setParams(next);
                    setFeature(null);
                    setSelectedId(null);
                  }}
                >
                  {value === 'rutas' ? 'Rutas municipales' : 'Predios DEMO'}
                </button>
              ))}
            </div>
          )}
          {!editor && view === 'rutas' && (
            <RouteBrowser
              routes={layers.data?.rutas}
              query={debounced}
              showReview={visibility.revision}
              loading={layers.isPending}
              selectedId={feature?.properties.id}
              onShowReview={() => {
                changeMode(true);
                setVisibility((v) => ({ ...v, revision: true, rutas: true }));
              }}
              onSelect={(value) => {
                selectionQuery.current = q;
                setFeature(value);
                setSelectedId(null);
                setVisibility((v) => ({ ...v, rutas: true }));
              }}
            />
          )}
          {!editor && view === 'rutas' && (
            <CartographyLegend
              data={cartography.data}
              visibleCodes={
                shownLayers?.rutas.features.map((f) => String(f.properties?.codigo)) || []
              }
              visibility={visibility}
              routeCode={feature?.kind === 'ruta' ? feature.properties.codigo : undefined}
              technical={technical}
            />
          )}
          {!editor && technical && (
            <SecondPassLegend
              summary={secondPassSummary.data}
              shown={shownSecondPass}
              zoom={mapView?.zoom ?? 0}
              truncated={!!secondPass.data['etiquetas-lote']?.truncated}
            />
          )}
          {secondPass.failed.length > 0 && (
            <p className="map-data-error" role="alert">
              No se pudieron cargar las capas de la segunda pasada.{' '}
              <button onClick={() => secondPass.failed.forEach((q) => void q.refetch())}>
                Reintentar
              </button>
            </p>
          )}
          {Object.values(territorio.data).some((d) => d?.truncated) && (
            <p className="map-data-note" role="status">
              Demasiados elementos en esta ventana: se muestra una parte. Acerque el mapa.
            </p>
          )}
          {cartography.isError && (
            <p className="map-data-error" role="alert">
              No se pudo cargar la simbología.{' '}
              <button onClick={() => void cartography.refetch()}>Reintentar</button>
            </p>
          )}
          {!editor && view === 'predios' && (
            <div className="results-panel">
              <button
                type="button"
                className="results-heading"
                aria-label="Mostrar lista de predios"
                aria-expanded={listOpen && !selectedId}
                onClick={() => {
                  if (selectedId) setSelectedId(null);
                  setListOpen((value) => (selectedId ? true : !value));
                }}
              >
                <span>
                  <MapPin className="size-4" />
                  Predios <strong>{predios.data?.total ?? '—'}</strong>
                </span>
                {predios.isFetching ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
              {listOpen && !selectedId && (
                <div className="results-list">
                  {predios.isPending ? (
                    <p className="empty-results">Cargando predios…</p>
                  ) : predios.isError ? (
                    <p className="empty-results" role="alert">
                      No pudimos cargar los predios.
                      <button type="button" onClick={() => void predios.refetch()}>
                        Reintentar
                      </button>
                    </p>
                  ) : !data.length ? (
                    <div className="empty-results">
                      <Search className="mx-auto mb-2 size-5" />
                      <p>No hay coincidencias.</p>
                      <button type="button" onClick={() => setParams({})}>
                        Limpiar búsqueda y filtros
                      </button>
                    </div>
                  ) : (
                    data.map((predio) => (
                      <button
                        type="button"
                        className="predio-result"
                        key={predio.id}
                        onClick={() => selectPredio(predio.id)}
                        aria-label={`Ver predio ${predio.codigo}`}
                      >
                        <span className="result-icon" style={{ color: predio.servicios[0]?.color }}>
                          <MapPin className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong>
                            {predio.codigo}
                            <em>DEMO</em>
                          </strong>
                          <span className="result-address">{predio.direccion}</span>
                          <small>
                            {predio.servicios.map((s) => s.nombre).join(' · ') || 'Sin servicio'}
                          </small>
                        </span>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </button>
                    ))
                  )}
                  {predios.data && predios.data.total > predios.data.limit && (
                    <p className="empty-results">
                      Mostrando {predios.data.limit}. Usa filtros para acotar.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {(catalogos.isError ||
            layers.isError ||
            (visibility.referencias && references.isError) ||
            (visibility.anotaciones && annotations.isError)) && (
            <p className="map-data-error" role="alert">
              No se pudieron cargar todos los datos.
              <button
                type="button"
                onClick={() => {
                  void catalogos.refetch();
                  void layers.refetch();
                  if (visibility.referencias) void references.refetch();
                  if (visibility.anotaciones) void annotations.refetch();
                }}
              >
                Reintentar
              </button>
            </p>
          )}
        </div>
        {selectedId && selected.isPending && !editor && (
          <div className="detail-loading" role="status">
            Cargando ficha…
          </div>
        )}
        {selectedId && selected.isError && !editor && (
          <div className="detail-loading" role="alert">
            No se pudo abrir la ficha.
            <button type="button" onClick={() => setSelectedId(null)}>
              Cerrar
            </button>
          </div>
        )}
        {selected.data && !editor && (
          <PredioDetail
            key={selected.data.id}
            predio={selected.data}
            onClose={() => setSelectedId(null)}
            onEdit={startEdit}
            onDelete={() => remove.mutate(selected.data!)}
            deleting={remove.isPending}
            error={remove.error?.message}
          />
        )}
        {feature && !editor && feature.kind === 'territorio' && (
          <TerritorialDetail
            key={feature.properties.id}
            id={feature.properties.id ?? ''}
            technical={technical}
            onClose={() => setFeature(null)}
          />
        )}
        {feature && !editor && feature.kind === 'segunda' && (
          <SecondPassDetail
            key={feature.properties.id}
            feature={feature}
            onClose={() => setFeature(null)}
          />
        )}
        {feature && !editor && feature.kind !== 'segunda' && feature.kind !== 'territorio' && (
          <MapFeatureDetail
            key={feature.properties.id}
            feature={feature}
            onClose={() => setFeature(null)}
          />
        )}
        {editor?.mode === 'draw' && (
          <div className="drawing-bar">
            <div>
              <strong>Dibuja el predio</strong>
              <p>Toca el mapa para añadir vértices. {draft.length} puntos.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditor(editor.existing ? { ...editor, mode: 'form' } : null);
                  setDraft([]);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!draft.length}
                onClick={() => setDraft((points) => points.slice(0, -1))}
              >
                <Undo2 />
                Deshacer
              </Button>
              <Button
                size="sm"
                disabled={draft.length < 3}
                onClick={() =>
                  setEditor({
                    ...editor,
                    mode: 'form',
                    input: { ...editor.input, geometry: closePolygon(draft) },
                  })
                }
              >
                <Check />
                Continuar
              </Button>
            </div>
          </div>
        )}
        {editor?.mode === 'form' && catalogos.data && (
          <PredioEditor
            initial={editor.input}
            catalogos={catalogos.data}
            editing={!!editor.existing}
            saving={save.isPending}
            error={save.error?.message}
            onCancel={() => {
              setEditor(null);
              setDraft([]);
            }}
            onSave={(input) => save.mutate({ input, existing: editor.existing })}
            onRedraw={(input) => {
              setEditor({ ...editor, input, mode: 'draw' });
              setDraft([]);
              save.reset();
            }}
          />
        )}
        {message && (
          <div className="map-toast" role="status">
            <Check className="size-4" />
            {message}
            <button type="button" aria-label="Cerrar aviso" onClick={() => setMessage('')}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="demo-map-note">
          {technical
            ? 'Modo Técnico · Procedencia CAD disponible'
            : 'Modo Operativo · Rutas y símbolos del plano'}{' '}
          · Vigencia por validar
        </div>
      </div>
    </section>
  );
}
