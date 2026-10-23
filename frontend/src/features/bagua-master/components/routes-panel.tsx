import { useState } from 'react';
import { ArrowLeft, ChevronDown, X } from 'lucide-react';
import type { RouteStatus, RouteSummary, RoutesResponse } from '../types';

const STATUS: Record<RouteStatus, { label: string; detail: string }> = {
  georreferenciada: {
    label: 'Georreferenciada',
    detail:
      'Trazo ubicado con el sistema de coordenadas del plano. La operación sigue pendiente de validación municipal.',
  },
  revision: {
    label: 'En revisión',
    detail:
      'Identificación o clasificación por confirmar. Se muestra con línea discontinua y no debe tomarse como recorrido vigente.',
  },
};

const formatKm = (meters: number) =>
  `${(meters / 1000).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

function Swatch({ route }: { route: RouteSummary }) {
  return (
    <svg className="bm-ruta-muestra" viewBox="0 0 28 8" aria-hidden="true">
      <line
        x1="2"
        y1="4"
        x2="26"
        y2="4"
        stroke={route.color}
        strokeWidth="4"
        strokeLinecap={route.estado === 'revision' ? 'butt' : 'round'}
        strokeDasharray={route.estado === 'revision' ? '5 3' : undefined}
      />
    </svg>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Ficha({ route }: { route: RouteSummary }) {
  const arrows = route.flechas;
  return (
    <dl data-testid="bm-ruta-ficha">
      <Row label="Estado">
        <strong>{STATUS[route.estado].label}</strong> · {STATUS[route.estado].detail}
      </Row>
      <Row label="Longitud de trazos">
        {formatKm(route.longitudTrazosM)} ({route.segmentos}{' '}
        {route.segmentos === 1 ? 'trazo' : 'trazos'}). {route.significadoLongitud}.
      </Row>
      <Row label="Sectores">
        {route.sectores.length
          ? route.sectores.join(', ')
          : 'El plano no rotula sectores para esta ruta'}
      </Row>
      <Row label="Sentido">
        {arrows.dibujadas > 0
          ? `${arrows.dibujadas} flechas del plano, verificadas contra el trazo. ${route.sentidoEstado}.`
          : 'Sin flechas recuperadas del plano: no se indica sentido de recorrido.'}
      </Row>
      <Row label="Horario">{route.horarioEstado}</Row>
      <Row label="Fuente documental">
        DWG municipal
        <br />
        Trazos: <span className="bm-mono">{route.procedencia.trazos}</span>
        <br />
        Flechas:{' '}
        {route.procedencia.flechas.length ? route.procedencia.flechas.join(', ') : 'sin flechas'}
        <br />
        Marcadores:{' '}
        {route.procedencia.marcadores.length
          ? route.procedencia.marcadores.join(', ')
          : 'sin marcadores'}
        <br />
        CRS: {route.crs}
      </Row>
      <Row label="Nota">{route.nota}</Row>
      {route.advertencias.length > 0 && (
        <Row label="Advertencias">
          <ul className="bm-ruta-avisos">
            {route.advertencias.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Row>
      )}
    </dl>
  );
}

// Panel de rutas de recolección: lista con selector y ficha de la ruta destacada.
export function RoutesPanel({
  routes,
  loading,
  failed,
  selected,
  onSelect,
  onClose,
}: {
  routes: RoutesResponse | undefined;
  loading: boolean;
  failed: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const current = routes?.rutas.find((r) => r.codigo === selected);
  return (
    <aside
      className={`bm-info bm-rutas ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Rutas de recolección"
      data-testid="bm-rutas-panel"
    >
      <header className="bm-info-head">
        <button
          type="button"
          className="bm-info-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Mostrar rutas' : 'Plegar rutas'}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronDown size={16} />
        </button>
        <div className="bm-info-heading">
          <p className="bm-info-kind">Rutas de recolección</p>
          <h2 className="bm-info-title">{current ? current.nombre : 'Recorridos municipales'}</h2>
        </div>
        {current && (
          <button
            type="button"
            className="bm-info-close"
            aria-label="Volver a todas las rutas"
            title="Volver a todas las rutas"
            data-testid="bm-rutas-todas"
            onClick={() => onSelect('')}
          >
            <ArrowLeft size={17} />
          </button>
        )}
        <button
          type="button"
          className="bm-info-close"
          aria-label="Ocultar rutas"
          title="Ocultar rutas"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {!collapsed && (
        <div className="bm-info-body">
          {failed && <p role="alert">No se pudieron cargar las rutas.</p>}
          {loading && !routes && <p>Cargando rutas…</p>}
          {routes && !current && (
            <>
              <p className="bm-rutas-ayuda">
                Elija una ruta para destacarla en el mapa; las demás se atenúan. También puede tocar
                un trazo.
              </p>
              <ul className="bm-rutas-lista">
                {routes.rutas.map((route) => (
                  <li key={route.codigo}>
                    <button
                      type="button"
                      data-testid={`bm-ruta-${route.codigo}`}
                      aria-pressed={false}
                      onClick={() => onSelect(route.codigo)}
                    >
                      <Swatch route={route} />
                      <span className="bm-ruta-nombre">{route.nombre}</span>
                      <span className="bm-ruta-meta">
                        <span className={`bm-chip bm-chip-${route.estado}`}>
                          {STATUS[route.estado].label}
                        </span>
                        {formatKm(route.longitudTrazosM)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {routes && current && <Ficha route={current} />}
          {routes?.aviso && <p className="bm-rutas-aviso">{routes.aviso}</p>}
        </div>
      )}
    </aside>
  );
}
