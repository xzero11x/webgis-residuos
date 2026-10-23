import { useRef, useState } from 'react';
import { X, FileText, Route, Clock3, Info, Minimize2 } from 'lucide-react';
import type { MapSelection } from './types';

interface Metadata {
  views?: { name: string; bounds: number[][] }[];
  sourceCrs?: string;
  segments?: number;
  scheduleStatus?: string;
  directionStatus?: string;
  coverage?: string;
  crsEvidence?: string;
  warnings?: string[];
  references?: string[];
  registration?: { holdout_matches: number; holdout_rms_m: number }[];
}
function metadata(value?: string): Metadata {
  try {
    return JSON.parse(value || '{}') as Metadata;
  } catch {
    return {};
  }
}

export function MapFeatureDetail({
  feature,
  onClose,
  onFocus,
}: {
  feature: MapSelection;
  onClose: () => void;
  onFocus?: (bounds: number[][]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  function toggleCollapsed(value: boolean) {
    setCollapsed(value);
    requestAnimationFrame(() => (value ? bubbleRef : collapseRef).current?.focus());
  }
  const p = feature.properties;
  const m = metadata(p.metadata);
  const demo = p.isDemo === 'true';
  const pending = p.status === 'revision';
  return (
    <>
      {collapsed && (
        <button
          ref={bubbleRef}
          type="button"
          className="map-info-bubble"
          style={{ borderColor: p.color || undefined }}
          aria-label={`Expandir información de ${p.nombre}`}
          aria-expanded={false}
          title={`Ver información · ${p.nombre}`}
          onClick={() => toggleCollapsed(false)}
        >
          <Info size={22} aria-hidden="true" />
        </button>
      )}
      <aside
        style={collapsed ? { display: 'none' } : undefined}
        className={`detail-panel municipal-detail ${expanded ? 'expanded' : ''}`}
        aria-label="Ficha de capa"
      >
        <button
          className="detail-mobile-handle"
          type="button"
          aria-label={expanded ? 'Contraer ficha de capa' : 'Expandir ficha de capa'}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <span />
        </button>
        <div className="panel-heading">
          <div>
            <span className={demo || pending ? 'demo-tag' : 'municipal-tag'}>
              {demo ? 'DEMO' : pending ? 'PENDIENTE DE REVISIÓN' : 'ARCHIVO MUNICIPAL'}
            </span>
            <h2>{p.nombre}</h2>
          </div>
          <div className="map-info-actions">
            <button
              ref={collapseRef}
              type="button"
              aria-label="Contraer información"
              title="Contraer información"
              aria-expanded={true}
              onClick={() => toggleCollapsed(true)}
            >
              <Minimize2 size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Cerrar información de capa"
              title="Cerrar selección"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="panel-scroll">
          {m.views && (
            <section className="detail-section">
              <h3>Acercar a una zona del recorrido</h3>
              <div className="flex flex-wrap gap-2">
                {m.views.map((v) => (
                  <button
                    type="button"
                    key={v.name}
                    className="rounded-lg border px-3 py-2 text-xs"
                    onClick={() => onFocus?.(v.bounds)}
                  >
                    Enfocar {v.name}
                  </button>
                ))}
              </div>
              <small>Encuadres de navegación; no son límites de cobertura.</small>
            </section>
          )}
          {p.servicio && (
            <p className="route-service">
              <Route size={16} />
              {p.servicio}
            </p>
          )}
          {p.ruta && <p>{p.ruta}</p>}
          {feature.kind === 'ruta' && !demo && (
            <small>I Inicio · F Fin · ○ Parada · ▲ Sentido del plano</small>
          )}
          {p.lengthKm && (
            <div className="route-facts">
              <div>
                <strong>{p.lengthKm} km</strong>
                <span>Suma de trazos</span>
              </div>
              <div>
                <strong>{m.segments ?? '—'}</strong>
                <span>Componentes</span>
              </div>
            </div>
          )}
          {p.note && (
            <p className={pending ? 'source-notice pending' : 'source-notice'}>{p.note}</p>
          )}
          {p.approval && <p className="source-notice pending">{p.approval}</p>}
          {p.association && (
            <p>
              {p.routeCode ? `${p.routeCode}: ` : ''}
              {p.association}
            </p>
          )}
          {p.ref && <small>Referencia CAD: {p.ref}</small>}
          {p.crsStatus && (
            <p className={p.crsStatus === 'provisional' ? 'source-notice pending' : undefined}>
              Referencia espacial:{' '}
              {p.crsStatus === 'provisional'
                ? 'provisional, traslación medida pendiente de adopción'
                : p.crsStatus}
            </p>
          )}
          {p.hidden === 'true' && (
            <p>Capa oculta en el DWG original; visible aquí para revisión.</p>
          )}
          {p.outsideVerifiedArea === 'true' && (
            <p className="source-notice pending">
              Fuera del área donde se comprobó la alineación. Posición por validar.
            </p>
          )}
          {p.labelRef && (
            <small>
              Rótulo asociado: {p.labelRef} · Distancia: {p.labelDistanceM} m
            </small>
          )}
          {feature.kind === 'ruta' && (
            <section className="detail-section">
              <h3>
                <Clock3 size={14} /> Horario y frecuencia
              </h3>
              <p>{p.horario || 'Por confirmar con la Gerencia'}</p>
              <p>{p.frecuencia || 'Frecuencia no validada'}</p>
              {!demo && (
                <small>
                  Los tiempos del plano se conservan como anotaciones. No se asignan automáticamente
                  como horario del servicio.
                </small>
              )}
            </section>
          )}
          {m.warnings?.map((warning) => (
            <p className="source-notice pending" key={warning}>
              {warning}
            </p>
          ))}
          {p.source && (
            <section className="detail-section">
              <h3>
                <FileText size={14} /> Procedencia
              </h3>
              <p className="source-filename">{p.source}</p>
              {p.layer && <small>Capa CAD: {p.layer}</small>}
              {m.coverage && <p>{m.coverage}</p>}
            </section>
          )}
          {m.sourceCrs && (
            <details className="source-details">
              <summary>Calidad y referencias</summary>
              <p>Sistema de referencia: {m.sourceCrs}</p>
              {m.crsEvidence && <p>{m.crsEvidence}</p>}
              <p>
                Flechas recuperadas de símbolos CAD. No se infiere sentido del orden de vértices.
                Consulta la leyenda del mapa.
              </p>
              {m.registration?.map((r, i) => (
                <p key={i}>
                  Ventana {i + 1}: {r.holdout_matches} vértices de comprobación; ajuste RMS{' '}
                  {(r.holdout_rms_m * 100).toFixed(1)} cm respecto al CAD. No equivale a precisión
                  en terreno.
                </p>
              ))}
              {m.references && (
                <p className="cad-handles">Referencias: {m.references.join(', ')}</p>
              )}
            </details>
          )}
          {feature.kind === 'referencia' && (
            <small>Información documental independiente del padrón de predios.</small>
          )}
          {demo && <small>Información de prueba, pendiente de validación municipal.</small>}
        </div>
      </aside>
    </>
  );
}
