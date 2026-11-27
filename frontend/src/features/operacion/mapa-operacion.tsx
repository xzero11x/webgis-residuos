import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { loadMapRuntime } from '@/features/bagua-master/map/runtime';
import { buildStyle } from '@/features/bagua-master/map/style';
import { API_BASE, CENTER } from '@/features/bagua-master/config';
import type { Situacion } from './tipos';

// Mapa de la operación: cada ruta coloreada por cómo va hoy (verde terminada, azul en ruta, rojo
// con problema, gris aún no sale) y la última posición registrada de cada vehículo.

export interface RutaEnMapa {
  id: string;
  ruta: string;
  nombre: string;
  situacion: Situacion;
  lon: number | null;
  lat: number | null;
  horaInicio: string;
}
interface Traces {
  trazos: GeoJSON.FeatureCollection<GeoJSON.MultiLineString, { ruta: string }>;
}
const TONE: Partial<Record<Situacion, string>> = {
  completada: '#15803d',
  en_curso: '#0070f3',
  interrumpida: '#dc2626',
  sin_iniciar: '#dc2626',
  no_ejecutada: '#dc2626',
  suspendida: '#d97706',
};
const NEUTRAL = '#9ca3af';
const PRIORITY: Situacion[] = [
  'en_curso',
  'interrumpida',
  'sin_iniciar',
  'por_iniciar',
  'completada',
  'no_ejecutada',
  'suspendida',
  'pendiente',
  'programada',
];

export function OperacionMapa({
  rutas,
  selected,
  onSelect,
}: {
  rutas: RutaEnMapa[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const traces = useQuery({
    queryKey: ['bagua-master', 'rutas-mapa'],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE}/rutas/mapa`, { signal });
      if (!response.ok) throw new Error('Sin trazos');
      return (await response.json()) as Traces;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let disposed = false;
    let cleanup = () => {};
    void loadMapRuntime().then((maplibre) => {
      if (disposed) return;
      const instance = new maplibre.Map({
        container: node,
        style: buildStyle('positron'),
        center: CENTER,
        zoom: 13.6,
        attributionControl: { compact: true },
        fadeDuration: 0,
        cooperativeGestures: true,
      });
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      instance.on('load', () => {
        // Atribución plegada: se abre con el botón (i) y no tapa el mapa.
        node.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        instance.addSource('op-rutas', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        instance.addLayer({
          id: 'op-rutas-borde',
          type: 'line',
          source: 'op-rutas',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['get', 'ancho_borde'] },
        });
        instance.addLayer({
          id: 'op-rutas',
          type: 'line',
          source: 'op-rutas',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'ancho'],
            'line-opacity': ['get', 'opacidad'],
          },
        });
        setReady(true);
      });
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(node);
      map.current = instance;
      cleanup = () => {
        observer.disconnect();
        instance.remove();
        map.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || !traces.data) return;
    const byRoute = new Map<string, RutaEnMapa>();
    for (const r of [...rutas].sort(
      (a, b) => PRIORITY.indexOf(a.situacion) - PRIORITY.indexOf(b.situacion),
    ))
      if (!byRoute.has(r.ruta)) byRoute.set(r.ruta, r);
    const chosen = rutas.find((r) => r.id === selected)?.ruta;
    const features = traces.data.trazos.features
      .filter((f) => byRoute.has(f.properties.ruta))
      .map((f) => {
        const r = byRoute.get(f.properties.ruta)!;
        const focus = !chosen || chosen === f.properties.ruta;
        return {
          ...f,
          properties: {
            ruta: f.properties.ruta,
            color: TONE[r.situacion] ?? NEUTRAL,
            ancho: chosen === f.properties.ruta ? 5 : 3,
            ancho_borde: chosen === f.properties.ruta ? 8 : 5,
            opacidad: focus ? 0.95 : 0.25,
          },
        };
      });
    (instance.getSource('op-rutas') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [ready, traces.data, rutas, selected]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    let cancelled = false;
    void loadMapRuntime().then((maplibre) => {
      if (cancelled) return;
      markers.current.forEach((m) => m.remove());
      markers.current = rutas
        .filter((r) => r.lon !== null && r.lat !== null && r.situacion !== 'completada')
        .map((r) => {
          const pin = document.createElement('button');
          pin.type = 'button';
          pin.className = `op-vehiculo${r.id === selected ? ' is-activo' : ''}`;
          pin.style.setProperty('--tono', TONE[r.situacion] ?? NEUTRAL);
          pin.textContent = r.nombre.split(' · ').at(-1) ?? r.nombre;
          pin.setAttribute('aria-label', `Última posición de ${r.nombre}`);
          pin.addEventListener('click', () => onSelect(r.id));
          return new maplibre.Marker({ element: pin }).setLngLat([r.lon!, r.lat!]).addTo(instance);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, rutas, selected, onSelect]);

  return (
    <div className="op-mapa">
      <div
        ref={element}
        className="op-mapa-lienzo"
        role="img"
        aria-label="Mapa de las rutas de hoy"
      />
      <ul className="op-mapa-leyenda" aria-hidden="true">
        <li style={{ '--tono': TONE.completada } as React.CSSProperties}>Terminada</li>
        <li style={{ '--tono': TONE.en_curso } as React.CSSProperties}>En ruta</li>
        <li style={{ '--tono': TONE.interrumpida } as React.CSSProperties}>Con problema</li>
        <li style={{ '--tono': NEUTRAL } as React.CSSProperties}>Aún no sale</li>
      </ul>
    </div>
  );
}
