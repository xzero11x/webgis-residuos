import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { CircleAlert, LocateFixed, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { env } from '@/config/env';
import { installCartography, updateCartography } from './cartography-layers';
import { installTerritorio, TERRITORIO_CLICK_LAYERS, updateTerritorio } from './territorio-layers';
import { TERRITORIO_GROUPS } from '@/features/territorio/types';
import { installCadReview, updateCadReview, CAD_REVIEW_LAYERS } from './cad-review-layers';
import {
  installSecondPass,
  updateSecondPass,
  SECOND_PASS_AREA_LAYERS,
  SECOND_PASS_CLICK_LAYERS,
} from './second-pass-layers';
import {
  BAGUA_BOUNDS,
  BAGUA_CENTER,
  EMPTY_COLLECTION,
  selectionProperties,
  closePolygon,
  type Layers,
  type MapSelection,
  type MapView,
  type Predio,
  type SecondPassLayer,
  type SecondPassVisibility,
  type TerritorioGroupKey,
  type TerritorioVisibility,
  type Visibility,
} from '@/features/territorio/types';

interface Props {
  predios: Predio[];
  layers?: Layers;
  references?: FeatureCollection;
  annotations?: FeatureCollection;
  cartography?: FeatureCollection;
  cadReview?: FeatureCollection;
  secondPass?: Partial<Record<SecondPassLayer, FeatureCollection>>;
  secondPassVisibility?: SecondPassVisibility;
  territorio?: Partial<Record<TerritorioGroupKey, FeatureCollection>>;
  territorioVisibility?: TerritorioVisibility;
  technical?: boolean;
  focused?: MapSelection | null;
  visibility: Visibility;
  selected?: Predio;
  drawing: boolean;
  draft: Position[];
  onSelect: (id: string) => void;
  onFeature: (feature: MapSelection) => void;
  onDraw: (point: Position) => void;
  onView?: (view: MapView) => void;
}

export function MapViewport({
  predios,
  layers,
  references,
  annotations,
  cartography,
  cadReview,
  secondPass,
  secondPassVisibility,
  territorio,
  territorioVisibility,
  technical = false,
  focused,
  visibility,
  selected,
  drawing,
  draft,
  onSelect,
  onFeature,
  onDraw,
  onView,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacks = useRef({ onSelect, onFeature, onDraw, onView, drawing });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    callbacks.current = { onSelect, onFeature, onDraw, onView, drawing };
  }, [onSelect, onFeature, onDraw, onView, drawing]);

  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    let disposed = false;
    let map: MapLibreMap | undefined;
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(element);
    void import('maplibre-gl')
      .then(({ Map, NavigationControl, setWorkerUrl }) => {
        if (disposed) return;
        // Emit MapLibre 6's separate worker as a Vite asset in production builds.
        setWorkerUrl(workerUrl);
        map = new Map({
          container: element,
          style: env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron',
          center: BAGUA_CENTER,
          zoom: 16.3,
          minZoom: 11.5,
          maxZoom: 21,
          maxBounds: BAGUA_BOUNDS,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        mapRef.current = map;
        map.on('idle', () => {
          element.dataset.idle = 'true';
          if (map?.getLayer('cad-directions'))
            element.dataset.directions = String(
              map.queryRenderedFeatures(undefined, { layers: ['cad-directions'] }).length,
            );
          const secondPass = [...SECOND_PASS_CLICK_LAYERS, ...SECOND_PASS_AREA_LAYERS].filter(
            (id) => map?.getLayer(id) && map.getLayoutProperty(id, 'visibility') === 'visible',
          );
          element.dataset.secondPass = String(
            secondPass.length
              ? map!.queryRenderedFeatures(undefined, { layers: secondPass }).length
              : 0,
          );
        });
        const reportView = () => {
          if (!map) return;
          const b = map.getBounds();
          callbacks.current.onView?.({
            bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
            zoom: map.getZoom(),
          });
        };
        map.on('moveend', reportView);
        map.on('movestart', () => {
          element.dataset.idle = 'false';
        });
        map.on('sourcedataloading', () => {
          element.dataset.idle = 'false';
        });
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        map.getCanvas().setAttribute('aria-label', 'Mapa interactivo de Bagua');
        map.on('load', () => {
          if (disposed || !map) return;
          for (const source of [
            'predios',
            'rutas',
            'puntos',
            'sectores',
            'draft',
            'referencias',
            'anotaciones',
          ])
            map.addSource(source, { type: 'geojson', data: EMPTY_COLLECTION });
          map.addLayer({
            id: 'referencias-fill',
            type: 'fill',
            source: 'referencias',
            paint: { 'fill-color': '#78958a', 'fill-opacity': 0.08 },
          });
          map.addLayer({
            id: 'referencias-line',
            type: 'line',
            source: 'referencias',
            paint: { 'line-color': '#688276', 'line-width': 0.8, 'line-opacity': 0.6 },
          });
          map.addLayer({
            id: 'anotaciones-circle',
            type: 'circle',
            source: 'anotaciones',
            paint: {
              'circle-color': '#a94ba1',
              'circle-radius': 3,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1.5,
            },
          });
          map.addLayer({
            id: 'anotaciones-label',
            type: 'symbol',
            source: 'anotaciones',
            minzoom: 17,
            layout: {
              'text-field': ['get', 'nombre'],
              'text-size': 10,
              'text-font': ['Noto Sans Regular'],
              'text-offset': [0, 1],
            },
            paint: { 'text-color': '#873a82', 'text-halo-color': '#fff', 'text-halo-width': 2 },
          });
          map.addLayer({
            id: 'sectores-fill',
            type: 'fill',
            source: 'sectores',
            paint: { 'fill-color': '#789b8a', 'fill-opacity': 0.065 },
          });
          map.addLayer({
            id: 'sectores-line',
            type: 'line',
            source: 'sectores',
            paint: {
              'line-color': '#587a6a',
              'line-width': 1.5,
              'line-dasharray': [4, 4],
              'line-opacity': 0.55,
            },
          });
          map.addLayer({
            id: 'rutas-halo',
            type: 'line',
            source: 'rutas',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.95 },
          });
          map.addLayer({
            id: 'rutas-line',
            type: 'line',
            source: 'rutas',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.9 },
          });
          map.addLayer({
            id: 'rutas-selected',
            type: 'line',
            source: 'rutas',
            filter: ['==', ['get', 'id'], ''],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 1 },
          });
          map.addLayer({
            id: 'route-labels',
            type: 'symbol',
            source: 'rutas',
            minzoom: 14.5,
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 350,
              'text-field': ['get', 'nombre'],
              'text-size': 11,
              'text-font': ['Noto Sans Regular'],
              'text-padding': 8,
            },
            paint: {
              'text-color': ['get', 'color'],
              'text-halo-color': '#fff',
              'text-halo-width': 2,
            },
          });
          // Keep provider street/place labels above route strokes, without assuming style IDs.
          for (const layer of map.getStyle().layers) {
            if (
              layer.type === 'symbol' &&
              layer.source !== 'rutas' &&
              layer.source !== 'anotaciones'
            )
              map.moveLayer(layer.id);
          }
          installCartography(map);
          installSecondPass(map);
          installTerritorio(map);
          installCadReview(map);
          map.addLayer({
            id: 'predios-fill',
            type: 'fill',
            source: 'predios',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.45 },
          });
          map.addLayer({
            id: 'predios-line',
            type: 'line',
            source: 'predios',
            paint: { 'line-color': ['get', 'color'], 'line-width': 1.8 },
          });
          map.addLayer({
            id: 'predios-selected',
            type: 'line',
            source: 'predios',
            filter: ['==', ['get', 'id'], ''],
            paint: { 'line-color': '#172c26', 'line-width': 4 },
          });
          map.addLayer({
            id: 'predios-label',
            type: 'symbol',
            source: 'predios',
            minzoom: 17,
            layout: {
              'text-field': ['get', 'codigo'],
              'text-size': 10,
              'text-font': ['Noto Sans Regular'],
              'text-offset': [0, 0],
            },
            paint: { 'text-color': '#203c33', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
          });
          map.addLayer({
            id: 'puntos-circle',
            type: 'circle',
            source: 'puntos',
            paint: {
              'circle-radius': 6,
              'circle-color': ['get', 'color'],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2.5,
            },
          });
          map.addLayer({
            id: 'draft-fill',
            type: 'fill',
            source: 'draft',
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': '#db963d', 'fill-opacity': 0.24 },
          });
          map.addLayer({
            id: 'draft-line',
            type: 'line',
            source: 'draft',
            filter: ['!=', ['geometry-type'], 'Point'],
            paint: { 'line-color': '#b76a1d', 'line-width': 2, 'line-dasharray': [3, 2] },
          });
          map.addLayer({
            id: 'draft-points',
            type: 'circle',
            source: 'draft',
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
              'circle-radius': 4,
              'circle-color': '#fff',
              'circle-stroke-color': '#b76a1d',
              'circle-stroke-width': 2,
            },
          });
          setReady(true);
          setFailed(false);
          reportView();
        });
        map.on('error', () => {
          if (!disposed) setFailed(true);
        });
        map.on('click', (event) => {
          if (!map) return;
          const cb = callbacks.current;
          if (cb.drawing) {
            cb.onDraw([+event.lngLat.lng.toFixed(7), +event.lngLat.lat.toFixed(7)]);
            return;
          }
          const queryLayers = [
            ...CAD_REVIEW_LAYERS,
            'cad-stops',
            'cad-directions',
            'cad-review',
            'cad-times',
            'cad-zones',
            ...SECOND_PASS_CLICK_LAYERS,
            ...SECOND_PASS_AREA_LAYERS,
            'predios-fill',
            'puntos-circle',
            'rutas-line',
            'sectores-fill',
            'anotaciones-circle',
            'referencias-fill',
            ...TERRITORIO_CLICK_LAYERS,
          ].filter((id) => map?.getLayer(id));
          if (!queryLayers.length) return;
          const features = map.queryRenderedFeatures(event.point, { layers: queryLayers });
          const predio = features.find((feature) => feature.layer.id === 'predios-fill');
          if (predio) {
            cb.onSelect(String(predio.properties.id));
            return;
          }
          // Review layers are only queried when the user switched them on in Técnico.
          // Territorio unificado: la entidad más específica de las superpuestas (lote, luego manzana).
          const territorial = TERRITORIO_CLICK_LAYERS.map((id) =>
            features.find((f) => f.layer.id === id),
          ).find(Boolean);
          if (territorial && !features.some((f) => f.layer.id === 'predios-fill')) {
            cb.onFeature({
              kind: 'territorio',
              properties: selectionProperties({
                id: territorial.properties.id,
                kind: territorial.properties.kind,
                nombre: territorial.properties.nombre,
              }),
            });
            return;
          }
          const feature =
            features.find((f) => f.layer.id.startsWith('cad-')) ||
            features.find((f) => f.layer.id === 'puntos-circle') ||
            features.find((f) => SECOND_PASS_CLICK_LAYERS.includes(f.layer.id)) ||
            features.find((f) => f.layer.id === 'rutas-line') ||
            features.find((f) => SECOND_PASS_AREA_LAYERS.includes(f.layer.id)) ||
            features[0];
          if (feature)
            cb.onFeature({
              kind:
                feature.layer.id === 'rutas-line'
                  ? 'ruta'
                  : feature.layer.id === 'puntos-circle'
                    ? 'punto'
                    : feature.layer.id === 'sectores-fill'
                      ? 'sector'
                      : feature.layer.id.startsWith('sp-')
                        ? 'segunda'
                        : 'referencia',
              properties: selectionProperties(feature.properties),
            });
        });
        map.on('mousemove', (event) => {
          if (!map) return;
          if (callbacks.current.drawing) {
            map.getCanvas().style.cursor = 'crosshair';
            return;
          }
          const ids = [
            'predios-fill',
            'rutas-line',
            'puntos-circle',
            ...SECOND_PASS_CLICK_LAYERS,
          ].filter((id) => map?.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
          map.getCanvas().style.cursor =
            ids.length && map.queryRenderedFeatures(event.point, { layers: ids }).length
              ? 'pointer'
              : '';
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: predios.map((p) => ({
        type: 'Feature',
        id: p.id,
        geometry: p.geometry,
        properties: { id: p.id, codigo: p.codigo, color: p.servicios[0]?.color || '#69867b' },
      })),
    };
    (map.getSource('predios') as GeoJSONSource).setData(collection);
    for (const name of ['rutas', 'puntos', 'sectores'] as const)
      (map.getSource(name) as GeoJSONSource).setData(layers?.[name] || EMPTY_COLLECTION);
    (map.getSource('referencias') as GeoJSONSource).setData(references || EMPTY_COLLECTION);
    (map.getSource('anotaciones') as GeoJSONSource).setData(annotations || EMPTY_COLLECTION);
    for (const [name, ids] of Object.entries({
      predios: ['predios-fill', 'predios-line', 'predios-label', 'predios-selected'],
      rutas: ['rutas-line', 'rutas-halo', 'rutas-selected', 'route-labels'],
      referencias: ['referencias-fill', 'referencias-line'],
      anotaciones: ['anotaciones-circle', 'anotaciones-label'],
      puntos: ['puntos-circle'],
      sectores: ['sectores-line', 'sectores-fill'],
    }))
      for (const id of ids)
        map.setLayoutProperty(
          id,
          'visibility',
          visibility[name as keyof Visibility] ? 'visible' : 'none',
        );
    map.setFilter('predios-selected', ['==', ['get', 'id'], selected?.id || '']);
  }, [ready, predios, layers, visibility, selected, references, annotations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    updateCartography(
      map,
      cartography,
      visibility,
      technical,
      focused?.kind === 'ruta' ? focused.properties.codigo || '' : '',
      layers?.rutas.features.map((f) => String(f.properties?.codigo)) || [],
    );
  }, [ready, cartography, visibility, technical, focused, layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !secondPassVisibility) return;
    updateSecondPass(map, secondPass || {}, secondPassVisibility, technical);
  }, [ready, secondPass, secondPassVisibility, technical]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !territorioVisibility) return;
    updateTerritorio(map, territorio || {}, territorioVisibility);
    // Número de elementos del territorio unificado que se dibujan (para pruebas y diagnóstico).
    if (container.current)
      container.current.dataset.territorio = String(
        TERRITORIO_GROUPS.reduce(
          (total, group) =>
            total +
            (territorioVisibility[group.key] ? (territorio?.[group.key]?.features.length ?? 0) : 0),
          0,
        ),
      );
  }, [ready, territorio, territorioVisibility]);

  useEffect(() => {
    if (mapRef.current && ready) updateCadReview(mapRef.current, technical ? cadReview : undefined);
  }, [ready, cadReview, technical]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features: FeatureCollection['features'] = draft.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates },
    }));
    if (draft.length >= 3)
      features.push({ type: 'Feature', properties: {}, geometry: closePolygon(draft) });
    else if (draft.length === 2)
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: draft },
      });
    (map.getSource('draft') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    map.getCanvas().style.cursor = drawing ? 'crosshair' : '';
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [draft, drawing, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = focused?.kind === 'ruta' ? focused.properties.id : '';
    map.setFilter('rutas-selected', ['==', ['get', 'id'], id || '']);
    map.setPaintProperty(
      'rutas-line',
      'line-opacity',
      id ? ['case', ['==', ['get', 'id'], id], 0.95, 0.16] : 0.85,
    );
    map.setPaintProperty(
      'rutas-halo',
      'line-opacity',
      id ? ['case', ['==', ['get', 'id'], id], 0.9, 0.12] : 0.8,
    );
    map.setFilter('route-labels', id ? ['==', ['get', 'id'], id] : null);
    if (!id) return;
    const route = layers?.rutas.features.find((r) => r.properties?.id === id);
    if (!route || route.geometry.type !== 'MultiLineString') return;
    const points = route.geometry.coordinates.flat();
    const xs = points.map((p) => p[0]!),
      ys = points.map((p) => p[1]!);
    const width = map.getContainer().clientWidth;
    const box = map.getContainer().getBoundingClientRect();
    const panel = map
      .getContainer()
      .parentElement?.querySelector('.municipal-detail')
      ?.getBoundingClientRect();
    const viewBounds = focused?.properties.viewBounds
      ? (JSON.parse(focused.properties.viewBounds) as [[number, number], [number, number]])
      : undefined;
    map.fitBounds(
      viewBounds || [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        duration: 500,
        maxZoom: 17,
        padding: {
          top: width < 640 ? 120 : 70,
          bottom: width < 640 ? (panel ? box.bottom - panel.top + 20 : 300) : 60,
          left: width > 1000 ? 330 : 30,
          right: width < 640 ? 25 : panel ? box.right - panel.left + 20 : 380,
        },
      },
    );
  }, [focused, layers, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected) return;
    const ring = selected.geometry.coordinates[0]!;
    const xs = ring.map((p) => p[0]!),
      ys = ring.map((p) => p[1]!);
    const width = map.getContainer().clientWidth;
    map.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        maxZoom: 18.1,
        duration: 500,
        padding: {
          top: 90,
          bottom: width < 640 ? 250 : 80,
          left: width > 1000 ? 330 : 30,
          right: width < 640 ? 30 : 370,
        },
      },
    );
  }, [selected, ready]);

  return (
    <>
      <div
        ref={container}
        className="absolute inset-0"
        style={{ position: 'absolute' }}
        data-testid="territorial-map"
        data-ready={ready}
        data-selected={selected?.id || ''}
        data-focused={focused?.properties.id || ''}
        data-mode={technical ? 'tecnico' : 'operativo'}
      />
      {!ready && !failed && (
        <div className="map-provider-status" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          Cargando Bagua…
        </div>
      )}
      {failed && (
        <div className="map-provider-status" role="alert">
          <CircleAlert className="size-4 shrink-0" />
          Algún recurso del mapa no pudo cargarse. Revisa tu conexión.
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      )}
      <Button
        size="icon"
        variant="outline"
        className="map-home"
        aria-label="Volver a Bagua"
        onClick={() => mapRef.current?.flyTo({ center: BAGUA_CENTER, zoom: 16.3, duration: 500 })}
      >
        <LocateFixed />
      </Button>
    </>
  );
}
