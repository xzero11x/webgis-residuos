import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type {
  Map as MapLibreMap,
  PointLike,
  GeoJSONSource,
  FilterSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { CENTER, DOWNLOAD_EXTENT, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../config';
import type { RouteMapData, Selection } from '../types';
import {
  addRouteLayers,
  focusRoute,
  ROUTE_HIT_LAYER,
  setRouteData,
  setRoutesVisible,
} from './rutas-layers';
import type { MapTheme } from './themes';
import { buildStyle, SELECTABLE_LAYERS } from './style';

// Visor MapLibre propio de BAGUA MASTER: instancia, estilo y protocolo PMTiles independientes
// del mapa municipal. Solo se carga cuando se abre /bagua-master.
let pmtilesRegistered = false;

/** Elemento seleccionable más prioritario bajo un punto de pantalla. */
function pickAt(map: MapLibreMap, point: PointLike): Selection | null {
  const layers = SELECTABLE_LAYERS.filter((s) => map.getLayer(s.layer));
  const features = map.queryRenderedFeatures(point, { layers: layers.map((s) => s.layer) });
  for (const candidate of layers) {
    const id = features.find((f) => f.layer.id === candidate.layer)?.properties?.id;
    if (typeof id === 'string') return { tabla: candidate.tabla, id };
  }
  return null;
}

/**
 * Punto de pantalla ("x,y") donde un clic selecciona un elemento visible de la capa indicada.
 * Sirve de diagnóstico para las pruebas automáticas; no altera el mapa.
 */
function samplePoint(map: MapLibreMap, layer: string, tabla: Selection['tabla']) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  for (const feature of map.queryRenderedFeatures({ layers: [layer] }).slice(0, 300)) {
    const geometry = feature.geometry;
    const coords =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]!.slice(0, -1)
        : geometry.type === 'LineString'
          ? [geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]!]
          : [];
    if (!coords.length) continue;
    const lng = coords.reduce((sum, c) => sum + c[0]!, 0) / coords.length;
    const lat = coords.reduce((sum, c) => sum + c[1]!, 0) / coords.length;
    const pixel = map.project([lng, lat]);
    if (pixel.x < 60 || pixel.y < 60 || pixel.x > width - 60 || pixel.y > height - 60) continue;
    const hit = pickAt(map, pixel);
    if (hit?.tabla === tabla && hit.id === feature.properties?.id)
      return `${Math.round(pixel.x)},${Math.round(pixel.y)}`;
  }
  return '';
}

/** Rutas municipales: capa independiente que se dibuja sobre las calles de Overture. */
export interface RoutesLayerState {
  visible: boolean;
  /** Código de la ruta destacada; vacío = todas por igual. */
  selected: string;
  data: RouteMapData | undefined;
}

/** Punto de pantalla ("x,y") donde un clic selecciona un trazo de ruta visible (diagnóstico de pruebas). */
function sampleRoutePoint(map: MapLibreMap) {
  if (!map.getLayer(ROUTE_HIT_LAYER)) return '';
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  for (const feature of map.queryRenderedFeatures({ layers: ['bm-rutas-linea'] }).slice(0, 200)) {
    const lines =
      feature.geometry.type === 'MultiLineString'
        ? feature.geometry.coordinates
        : feature.geometry.type === 'LineString'
          ? [feature.geometry.coordinates]
          : [];
    for (const line of lines) {
      const vertex = line[Math.floor(line.length / 2)];
      if (!vertex) continue;
      const pixel = map.project([vertex[0]!, vertex[1]!]);
      if (pixel.x < 60 || pixel.y < 60 || pixel.x > width - 60 || pixel.y > height - 60) continue;
      const hit = map.queryRenderedFeatures(pixel, { layers: [ROUTE_HIT_LAYER] })[0];
      if (hit?.properties?.ruta === feature.properties?.ruta)
        return `${Math.round(pixel.x)},${Math.round(pixel.y)}`;
    }
  }
  return '';
}

interface Props {
  selection: Selection | null;
  mode3d: boolean;
  theme: MapTheme;
  heights?: FeatureCollection;
  showSimulated: boolean;
  routes: RoutesLayerState;
  onSelectRoute: (code: string) => void;
  onSelect: (selection: Selection | null) => void;
  onMap: (map: MapLibreMap | null) => void;
  onFailure: () => void;
}

export function BaguaMasterMap({
  selection,
  mode3d,
  theme,
  heights,
  showSimulated,
  routes,
  onSelectRoute,
  onSelect,
  onMap,
  onFailure,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacks = useRef({ onSelect, onSelectRoute, onMap, onFailure });
  const routesRef = useRef(routes);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callbacks.current = { onSelect, onSelectRoute, onMap, onFailure };
    routesRef.current = routes;
  }, [onSelect, onSelectRoute, onMap, onFailure, routes]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: MapLibreMap | undefined;
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(element);
    void Promise.all([import('maplibre-gl'), import('pmtiles')])
      .then(([maplibre, pmtiles]) => {
        if (disposed) return;
        maplibre.setWorkerUrl(workerUrl);
        if (!pmtilesRegistered) {
          const protocol = new pmtiles.Protocol();
          maplibre.addProtocol('pmtiles', protocol.tile);
          pmtilesRegistered = true;
        }
        const [[w, s], [e, n]] = DOWNLOAD_EXTENT;
        map = new maplibre.Map({
          container: element,
          style: buildStyle(),
          center: CENTER,
          zoom: INITIAL_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          maxPitch: 60,
          maxBounds: [
            [w - 0.01, s - 0.01],
            [e + 0.01, n + 0.01],
          ],
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          fadeDuration: 250,
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        map.getCanvas().setAttribute('aria-label', 'Mapa urbano de Bagua (Overture Maps)');
        map.on('load', () => {
          if (disposed) return;
          element.dataset.ready = 'true';
          setReady(true);
          callbacks.current.onMap(map ?? null);
        });
        map.on('movestart', () => {
          element.dataset.idle = 'false';
        });
        map.on('idle', () => {
          if (!map) return;
          element.dataset.idle = 'true';
          element.dataset.zoom = map.getZoom().toFixed(2);
          element.dataset.pitch = map.getPitch().toFixed(0);
          element.dataset.centro = map
            .getCenter()
            .toArray()
            .map((v) => v.toFixed(5))
            .join(',');
          // Recuentos de lo dibujado, para diagnóstico y pruebas.
          const count = (layers: string[]) =>
            map!.queryRenderedFeatures({ layers: layers.filter((l) => map!.getLayer(l)) }).length;
          element.dataset.calles = String(count(['bm-vias']));
          element.dataset.edificios = String(count(['bm-edificios']));
          element.dataset.lugares = String(count(['bm-lugares']));
          element.dataset.rotulos = String(count(['bm-calles-texto']));
          element.dataset.rutasTrazos = String(
            count(['bm-rutas-linea', 'bm-rutas-linea-revision']),
          );
          element.dataset.rutasFlechas = String(count(['bm-rutas-flechas']));
          element.dataset.muestraRuta = sampleRoutePoint(map);
          element.dataset.muestraEdificio = samplePoint(map, 'bm-edificios', 'edificio');
          element.dataset.muestraVia = samplePoint(map, 'bm-vias', 'red_vial');
        });
        map.on('error', (event) => {
          // Un error de recurso de BAGUA MASTER no afecta a ningún otro módulo.
          if (!disposed && !map?.loaded()) callbacks.current.onFailure();
          console.warn('BAGUA MASTER:', event.error?.message);
        });
        map.on('click', (event) => {
          if (!map) return;
          // Con las rutas visibles, un clic sobre un trazo selecciona la ruta, no la calle de abajo.
          if (routesRef.current.visible && map.getLayer(ROUTE_HIT_LAYER)) {
            const code = map.queryRenderedFeatures(event.point, { layers: [ROUTE_HIT_LAYER] })[0]
              ?.properties?.ruta;
            if (typeof code === 'string') {
              callbacks.current.onSelectRoute(code);
              return;
            }
          }
          callbacks.current.onSelect(pickAt(map, event.point));
        });
        map.on('mousemove', (event) => {
          if (!map) return;
          const layers = SELECTABLE_LAYERS.map((s) => s.layer).filter(
            (l) => map!.getLayer(l) && l !== 'bm-terreno' && l !== 'bm-usos',
          );
          const overRoute =
            routesRef.current.visible &&
            !!map.getLayer(ROUTE_HIT_LAYER) &&
            map.queryRenderedFeatures(event.point, { layers: [ROUTE_HIT_LAYER] }).length > 0;
          map.getCanvas().style.cursor =
            overRoute || map.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : '';
        });
      })
      .catch(() => {
        if (!disposed) callbacks.current.onFailure();
      });
    return () => {
      disposed = true;
      observer.disconnect();
      callbacks.current.onMap(null);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Resalta el elemento seleccionado (edificio o vía) en el propio mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = selection?.id ?? '';
    map.setFilter('bm-alturas-seleccion', [
      '==',
      ['get', 'id'],
      selection?.tabla === 'edificio' ? id : '',
    ]);
    map.setFilter('bm-seleccion-area', [
      '==',
      ['get', 'id'],
      selection?.tabla === 'edificio' ? id : '',
    ]);
    map.setFilter('bm-seleccion-via', [
      '==',
      ['get', 'id'],
      selection?.tabla === 'red_vial' ? id : '',
    ]);
  }, [selection, ready]);

  // Rutas: se crean al recibir los datos, se muestran u ocultan y destacan la seleccionada.
  useEffect(() => {
    const map = mapRef.current;
    const { data, selected, visible } = routesRef.current;
    if (!map || !ready || !data) return;
    if (map.getSource('bm-rutas')) setRouteData(map, data);
    else addRouteLayers(map, data, selected, visible);
  }, [ready, routes.data]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource('bm-rutas')) return;
    setRoutesVisible(map, routes.visible);
    focusRoute(map, routes.selected);
  }, [ready, routes.data, routes.visible, routes.selected]);

  // Cambia solo pintura: conserva fuentes, cámara, filtros, selección y capas municipales.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const next = buildStyle(theme);
    for (const layer of next.layers) {
      if (!map.getLayer(layer.id) || !('paint' in layer)) continue;
      for (const [property, value] of Object.entries(layer.paint ?? {})) {
        map.setPaintProperty(
          layer.id,
          property as Parameters<MapLibreMap['setPaintProperty']>[1],
          value,
        );
      }
    }
    map.setLight(next.light!);
    if (container.current) container.current.dataset.theme = theme;
  }, [theme, ready]);

  // Capa derivada independiente; se descarga solo al activar 2.5D y queda en caché.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && heights) (map.getSource('bm-alturas') as GeoJSONSource).setData(heights);
  }, [heights, ready]);

  // El usuario puede ocultar toda simulación sin ocultar las estimaciones satelitales.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visible: FilterSpecification = showSimulated
      ? ['all']
      : ['!=', ['get', 'tipo'], 'simulada'];
    map.setFilter('bm-alturas-3d', visible);
    map.setFilter('bm-alturas-seleccion', [
      'all',
      visible,
      ['==', ['get', 'id'], selection?.tabla === 'edificio' ? selection.id : ''],
    ] as FilterSpecification);
  }, [showSimulated, selection, ready]);

  // 2.5D: las simulaciones se mantienen identificadas y se pueden ocultar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('bm-edificios-3d', 'visibility', mode3d ? 'visible' : 'none');
    map.setLayoutProperty('bm-alturas-3d', 'visibility', mode3d ? 'visible' : 'none');
    map.setLayoutProperty('bm-alturas-seleccion', 'visibility', mode3d ? 'visible' : 'none');
    if (mode3d) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
    map.easeTo({
      pitch: mode3d ? 50 : 0,
      bearing: mode3d ? map.getBearing() : 0,
      zoom: mode3d ? Math.max(16, map.getZoom()) : map.getZoom(),
      duration: 600,
    });
  }, [mode3d, ready]);

  return (
    <div
      ref={container}
      className="bm-map"
      data-testid="bagua-master-map"
      data-ready="false"
      data-theme={theme}
      data-modo={mode3d ? '2.5d' : '2d'}
      data-rutas={routes.visible ? 'visibles' : 'ocultas'}
      data-ruta-seleccionada={routes.selected}
    />
  );
}
