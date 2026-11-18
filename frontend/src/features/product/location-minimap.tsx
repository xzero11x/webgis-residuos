import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadMapRuntime } from '@/features/bagua-master/map/runtime';
import { buildStyle } from '@/features/bagua-master/map/style';
import { DOWNLOAD_EXTENT } from '@/features/bagua-master/config';

const stateText: Record<string, { label: string; tone: string }> = {
  verificada: { label: 'Ubicación verificada', tone: 'is-info' },
  aproximada: { label: 'Ubicación aproximada', tone: 'is-warn' },
  conflictiva: { label: 'Ubicación en conflicto', tone: 'is-danger' },
  pendiente: { label: 'Ubicación pendiente', tone: '' },
};

// Miniatura cartográfica real (misma base local de BAGUA MASTER). Si el predio no tiene
// coordenadas, no inventa ninguna: explica que la ubicación está pendiente.
export function LocationMiniMap({
  point,
  state,
  code,
  mapHref,
  viaLink = false,
  synthetic = false,
}: {
  point: [number, number] | null;
  state: string;
  code: string;
  mapHref: string;
  viaLink?: boolean;
  synthetic?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const inside =
    !!point &&
    point[0] >= DOWNLOAD_EXTENT[0][0] &&
    point[0] <= DOWNLOAD_EXTENT[1][0] &&
    point[1] >= DOWNLOAD_EXTENT[0][1] &&
    point[1] <= DOWNLOAD_EXTENT[1][1];
  const info = stateText[state] ?? stateText.pendiente!;
  useEffect(() => {
    const element = container.current;
    if (!element || !point || !inside) return;
    let disposed = false;
    let cleanup = () => {};
    void loadMapRuntime().then((maplibre) => {
      if (disposed) return;
      const map = new maplibre.Map({
        container: element,
        style: buildStyle('positron'),
        center: point,
        zoom: 17.2,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
      });
      const pin = document.createElement('div');
      pin.className = `pr-minimap-pin${viaLink ? ' is-link' : state === 'aproximada' ? ' is-approximate' : ''}`;
      new maplibre.Marker({ element: pin }).setLngLat(point).addTo(map);
      const observer = new ResizeObserver(() => map.resize());
      observer.observe(element);
      cleanup = () => {
        observer.disconnect();
        map.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [point, inside, state, viaLink]);
  return (
    <section className="pr-minimap" aria-label={`Ubicación geográfica del predio ${code}`}>
      {point && inside ? (
        <div
          ref={container}
          className="pr-minimap-canvas"
          role="img"
          aria-label={`Vista previa del lugar de ${code}`}
        />
      ) : (
        <div className="pr-minimap-empty">
          <MapPin size={20} aria-hidden="true" style={{ margin: '0 auto' }} />
          <strong>Ubicación pendiente</strong>
          Este expediente no tiene un punto confirmado en el mapa. No se estima a partir de
          edificios cercanos.
        </div>
      )}
      <div className="pr-minimap-foot">
        {viaLink ? (
          <span
            className="pr-chip is-info"
            title="Ubicado por su vínculo confirmado con una edificación Overture"
          >
            Vínculo espacial confirmado{synthetic ? ' · sintético' : ''}
          </span>
        ) : (
          <span className={`pr-chip ${info.tone}`}>{info.label}</span>
        )}
        {point && inside && (
          <Button asChild size="sm" variant="outline">
            <Link to={mapHref}>Ver en el mapa</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
