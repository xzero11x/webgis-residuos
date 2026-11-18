import { ActivityComposer } from './activity-composer';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Map as MapLibreMap, Marker as MarkerType } from 'maplibre-gl';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { management, showDay, type Detail, type User } from '@/features/gestion/api';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DOWNLOAD_EXTENT } from '../config';
import { PredioSpatialLinks, SpatialHighlight } from './predio-spatial-links';

function inside(point: [number, number]) {
  return (
    point[0] >= DOWNLOAD_EXTENT[0][0] &&
    point[0] <= DOWNLOAD_EXTENT[1][0] &&
    point[1] >= DOWNLOAD_EXTENT[0][1] &&
    point[1] <= DOWNLOAD_EXTENT[1][1]
  );
}
const tabs = ['General', 'Personas', 'Unidades', 'Servicios', 'Actividad'] as const;

export function PredioReference({
  id,
  map,
  onClose,
  suspended = false,
}: {
  id: string;
  map: MapLibreMap | null;
  onClose: () => void;
  suspended?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((value) => value === params.get('ficha')) || 'General';
  const heading = useRef<HTMLHeadingElement>(null);
  const lastLocation = useRef('');
  const [approximate, setApproximate] = useState(false);
  const [composing, setComposing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['gestion', 'inspector', id],
    queryFn: ({ signal }) => management<Detail>(`/predios/${id}`, 'GET', undefined, signal),
    retry: false,
    gcTime: 0,
  });
  const data = query.isError ? undefined : query.data;
  const units = useQuery({
    queryKey: ['gestion', 'unidades', id],
    queryFn: () =>
      management<{
        items: { id: string; codigo: string; nombre: string; tipo: string; activa: boolean }[];
      }>(`/predios/${id}/unidades`),
    enabled: query.isSuccess,
    retry: false,
    gcTime: 0,
  });
  const p = data?.predio;
  const latest = data?.entregas.find((e) => !e.anulada);
  const session = useQuery({
    queryKey: ['gestion', 'sesion'],
    queryFn: () => management<User>('/sesion'),
    enabled: !!p,
    retry: false,
  });
  const point = p?.ubicacion?.coordinates;
  const canLocate =
    !!point &&
    inside(point) &&
    (p?.estado_ubicacion === 'verificada' || (p?.estado_ubicacion === 'aproximada' && approximate));
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [id]);
  useEffect(() => {
    if (!map || !point || !canLocate || !p || suspended) return;
    let marker: MarkerType | undefined,
      disposed = false;
    void import('maplibre-gl').then(({ Marker }) => {
      if (disposed) return;
      const element = document.createElement('div');
      element.className = `bm-predio-marker${p.estado_ubicacion === 'aproximada' ? ' is-approximate' : ''}`;
      element.setAttribute('role', 'img');
      element.setAttribute(
        'aria-label',
        `Referencia ${p.sintetica ? 'sintética ' : ''}${p.codigo} · ${p.estado_ubicacion}`,
      );
      marker = new Marker({ element }).setLngLat(point).addTo(map);
      map.resize();
      const narrow = window.matchMedia('(max-width: 767px)').matches;
      const locationKey = `${id}:${point.join(',')}:${p.estado_ubicacion}`;
      if (lastLocation.current !== locationKey)
        map.flyTo({
          center: point,
          zoom: 17,
          duration: 600,
          padding: {
            top: 40,
            bottom: narrow ? Math.round(map.getContainer().clientHeight * 0.53) : 40,
            left: 30,
            right: 70,
          },
        });
      lastLocation.current = locationKey;
    });
    return () => {
      disposed = true;
      marker?.remove();
    };
  }, [map, point, canLocate, p, suspended, id]);
  const full = `/bagua-master/expedientes/predio/${id}`;
  const login = '/bagua-master/expedientes';
  const denied = query.error instanceof ApiError && query.error.status === 401;
  function choose(value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('ficha', value);
        return next;
      },
      { replace: true },
    );
  }
  const highlight = (
    <SpatialHighlight id={id} map={map} suspended={suspended} autoLocate={!!p && !canLocate} />
  );
  return (
    <aside
      className={`bm-predio-inspector${sheetExpanded ? ' is-expanded' : ''}${composing ? ' is-composing' : ''}`}
      aria-label="Ficha contextual del predio"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {p && highlight}
      <button
        className="bm-sheet-resize"
        type="button"
        aria-expanded={sheetExpanded}
        onClick={() => setSheetExpanded((v) => !v)}
      >
        {sheetExpanded ? 'Reducir ficha' : 'Ampliar ficha'}
      </button>
      <header>
        <h2 ref={heading} tabIndex={-1}>
          {p ? p.direccion.split(' · ')[0] : 'Ficha del predio'}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar ficha del predio">
          <X size={18} aria-hidden="true" />
        </Button>
      </header>
      {query.isPending ? (
        <p className="bm-inspector-message" role="status">
          Cargando ficha…
        </p>
      ) : query.isError ? (
        <div className="bm-inspector-message" role="alert">
          <p>
            {denied
              ? 'Ingresa para consultar la ficha administrativa.'
              : query.error instanceof ApiError && query.error.status === 404
                ? 'No se encontró este predio. Revisa el código o vuelve a buscar.'
                : 'No se pudo cargar la ficha. Inténtalo nuevamente.'}
          </p>
          {denied ? (
            <Link to={login}>Ingresar</Link>
          ) : (
            <Button variant="outline" onClick={() => void query.refetch()}>
              Reintentar ficha
            </Button>
          )}
        </div>
      ) : (
        p &&
        data && (
          <>
            <div className="bm-inspector-identity">
              {p.archivado && <strong>Predio archivado · solo consulta</strong>}
              <p>
                {p.codigo} · {p.uso}
              </p>
              <p>{p.sector || 'Sector sin información'}</p>
              <p className="bm-inspector-source">
                {p.sintetica ? 'Datos sintéticos · ensayo, sin validez municipal' : p.fuente}
              </p>
            </div>
            {saved && (
              <p className="bm-save-confirmation" role="status">
                Entrega guardada · ya aparece en la actividad del predio.
              </p>
            )}
            {composing ? (
              <ActivityComposer
                data={data}
                onClose={() => setComposing(false)}
                onSaved={() => {
                  setComposing(false);
                  setSaved(true);
                  choose('Actividad');
                }}
              />
            ) : (
              <>
                <div
                  className="bm-inspector-tabs"
                  role="tablist"
                  aria-label="Vistas de la ficha contextual"
                >
                  {tabs.map((value, index) => (
                    <button
                      type="button"
                      key={value}
                      role="tab"
                      id={`predio-tab-${value}`}
                      aria-selected={tab === value}
                      aria-controls="predio-inspector-content"
                      tabIndex={tab === value ? 0 : -1}
                      onClick={() => choose(value)}
                      onKeyDown={(e) => {
                        const next =
                          e.key === 'ArrowRight'
                            ? (index + 1) % tabs.length
                            : e.key === 'ArrowLeft'
                              ? (index + tabs.length - 1) % tabs.length
                              : e.key === 'Home'
                                ? 0
                                : e.key === 'End'
                                  ? tabs.length - 1
                                  : null;
                        if (next !== null) {
                          e.preventDefault();
                          choose(tabs[next]!);
                          document.getElementById(`predio-tab-${tabs[next]}`)?.focus();
                        }
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div
                  className="bm-inspector-content"
                  id="predio-inspector-content"
                  role="tabpanel"
                  aria-labelledby={`predio-tab-${tab}`}
                  tabIndex={0}
                >
                  {tab === 'General' && (
                    <>
                      <div className="bm-record-overview">
                        <h3>Este predio, en un vistazo</h3>
                        <p>
                          {p.uso || 'Uso sin información'} · {p.sector || 'Sector pendiente'}
                        </p>
                        <div className="bm-relation-summary">
                          <button type="button" onClick={() => choose('Personas')}>
                            {data.personasPermitidas ? data.personas.length : 'Restringido'}
                            <span>Personas vinculadas</span>
                          </button>
                          <button type="button" onClick={() => choose('Unidades')}>
                            {units.isSuccess ? units.data.items.length : '…'}
                            <span>Unidades</span>
                          </button>
                          <button type="button" onClick={() => choose('Servicios')}>
                            {data.asignaciones.length}
                            <span>Servicios registrados</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          className="bm-latest-activity"
                          onClick={() => choose('Actividad')}
                        >
                          <span>Última entrega registrada</span>
                          <strong>{latest?.material || 'Sin entregas registradas'}</strong>
                          {latest && (
                            <span>
                              {showDay(latest.fecha)} ·{' '}
                              {latest.cantidad === null
                                ? 'Sin medición'
                                : `${latest.cantidad} ${latest.unidad}`}
                            </span>
                          )}
                        </button>
                      </div>
                      <details className="bm-record-provenance">
                        <summary>Ubicación y procedencia</summary>
                        <PredioSpatialLinks id={id} map={map} />
                        <dl>
                          <div>
                            <dt>Ubicación</dt>
                            <dd>
                              {p.estado_ubicacion === 'conflictiva'
                                ? 'Conflictiva; requiere revisión. No se coloca un punto.'
                                : !point
                                  ? 'Pendiente; no se coloca un punto.'
                                  : !inside(point)
                                    ? 'La referencia está fuera del ámbito urbano disponible en este visor.'
                                    : p.estado_ubicacion === 'verificada'
                                      ? p.sintetica
                                        ? 'Verificada en el registro sintético.'
                                        : 'Ubicación verificada.'
                                      : 'Aproximada; pendiente de verificación.'}
                            </dd>
                          </div>
                          {p.evidencia_ubicacion && (
                            <div>
                              <dt>Evidencia de ubicación</dt>
                              <dd>{p.evidencia_ubicacion}</dd>
                            </div>
                          )}
                          <div>
                            <dt>Uso declarado</dt>
                            <dd>{p.uso || 'Sin información registrada'}</dd>
                          </div>
                          <div>
                            <dt>Fuente</dt>
                            <dd>{p.fuente}</dd>
                          </div>
                          <div>
                            <dt>Actualización</dt>
                            <dd>{showDay(p.actualizado_en)}</dd>
                          </div>
                          {p.observaciones && (
                            <div>
                              <dt>Observaciones</dt>
                              <dd>{p.observaciones}</dd>
                            </div>
                          )}
                        </dl>
                        {point && inside(point) && p.estado_ubicacion === 'aproximada' && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => setApproximate((value) => !value)}
                              aria-pressed={approximate}
                            >
                              {approximate
                                ? 'Ocultar referencia aproximada'
                                : 'Mostrar referencia aproximada'}
                            </Button>
                            {approximate && (
                              <p role="status">
                                Referencia aproximada de prueba; no confirma un límite predial.
                              </p>
                            )}
                          </>
                        )}
                      </details>
                      <p className="bm-inspector-help">
                        Este registro administrativo es independiente de las edificaciones Overture.
                      </p>
                    </>
                  )}
                  {tab === 'Personas' && (
                    <>
                      <p>
                        Vínculos declarados con rol y vigencia. Contribuyente no equivale a
                        propietario u ocupante.
                      </p>
                      {!data.personasPermitidas ? (
                        <p>Tu perfil no consulta identidades personales.</p>
                      ) : !data.personas.length ? (
                        <p>Sin personas vinculadas registradas.</p>
                      ) : (
                        <ul className="bm-inspector-list">
                          {data.personas.map((person) => {
                            const next = new URLSearchParams(params);
                            [
                              'predio',
                              'ficha',
                              'trabajo',
                              'vista',
                              'registro',
                              'ampliar',
                              'unidad',
                              'espacial',
                              'edificio_revision',
                            ].forEach((key) => next.delete(key));
                            next.set('persona', person.persona_id);
                            next.set('origen_predio', id);
                            return (
                              <li key={person.id}>
                                <Link to={`?${next}`}>{person.nombre}</Link>
                                <p>
                                  {person.tipo.replace(/_/g, ' ')} · {showDay(person.desde)}
                                  {person.hasta
                                    ? ` hasta ${showDay(person.hasta)}`
                                    : ' · sin fecha de cierre'}
                                </p>
                                <p>{person.evidencia}</p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                  {tab === 'Unidades' && (
                    <>
                      <p>
                        Unidades y secciones administrativas; no se deducen de edificios Overture.
                      </p>
                      {units.isPending ? (
                        <p role="status">Cargando unidades…</p>
                      ) : units.isError ? (
                        <div role="alert">
                          <p>No se pudieron consultar las unidades.</p>
                          <Button variant="outline" onClick={() => void units.refetch()}>
                            Reintentar unidades
                          </Button>
                        </div>
                      ) : units.data.items.length ? (
                        <ul className="bm-inspector-list">
                          {units.data.items.map((unit) => (
                            <li key={unit.id}>
                              <Link
                                to={`?${new URLSearchParams({ ...Object.fromEntries(params), unidad: unit.id })}`}
                              >
                                {unit.codigo} · {unit.nombre}
                              </Link>
                              <p>
                                {unit.tipo} · {unit.activa ? 'Activa' : 'Inactiva'}
                              </p>
                              <p>
                                Abre la unidad para consultar sus personas y servicios específicos.
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Sin unidades registradas.</p>
                      )}
                    </>
                  )}
                  {tab === 'Servicios' && (
                    <>
                      <p>
                        Las asignaciones describen registros de servicio; no acreditan una
                        recolección realizada.
                      </p>
                      {!data.asignaciones.length ? (
                        <p>
                          Sin asignaciones registradas. No significa que el predio carezca de
                          atención.
                        </p>
                      ) : (
                        <ul className="bm-inspector-list">
                          {data.asignaciones.map((a) => (
                            <li key={a.id}>
                              <h3>{a.nombre}</h3>
                              <Link
                                to={`/bagua-master?${new URLSearchParams({ ...Object.fromEntries(params), trabajo: 'gestion', vista: 'servicios', servicio: a.servicio_id, operacion: 'entregas' })}`}
                              >
                                Consultar actividad de este servicio →
                              </Link>
                              <p>Estado: {a.estado}</p>
                              <p>
                                {showDay(a.desde)} ·{' '}
                                {a.hasta
                                  ? `Hasta ${showDay(a.hasta)}`
                                  : 'Sin fecha de cierre registrada'}
                              </p>
                              <p>{a.evidencia}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {tab === 'Actividad' && (
                    <>
                      <h3>Participaciones registradas</h3>
                      <p>Participar en un programa no acredita una entrega.</p>
                      {!data.participaciones.length ? (
                        <p>Sin participaciones registradas.</p>
                      ) : (
                        <ul className="bm-inspector-list">
                          {data.participaciones.slice(0, 5).map((a) => (
                            <li key={a.id}>
                              <strong>{a.nombre}</strong>
                              <p>
                                {showDay(a.desde)} ·{' '}
                                {a.hasta
                                  ? `Hasta ${showDay(a.hasta)}`
                                  : 'Sin fecha de cierre registrada'}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <h3>Últimas entregas</h3>
                      {!data.entregas.length ? (
                        <p>Sin entregas registradas.</p>
                      ) : (
                        <ul className="bm-inspector-list">
                          {data.entregas
                            .filter((e) => !e.anulada)
                            .slice(0, 5)
                            .map((e) => (
                              <li key={e.id}>
                                <strong>
                                  {e.material}
                                  {e.anulada ? ' · Anulada' : ''}
                                </strong>
                                <p>
                                  {showDay(e.fecha)} · {e.servicio}
                                </p>
                                <p>
                                  {e.cantidad === null
                                    ? 'Cantidad sin información'
                                    : `${Number(e.cantidad).toLocaleString('es-PE')} ${e.unidad}`}
                                </p>
                                {e.anulada && <p>{e.motivo_anulacion}</p>}
                              </li>
                            ))}
                        </ul>
                      )}
                      <p>
                        La ficha completa conserva todas las participaciones y entregas, incluidas
                        las anuladas.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
            <footer>
              <Link
                to={`/bagua-master?${new URLSearchParams({ ...Object.fromEntries(params), espacial: 'revision' })}`}
              >
                Revisar vínculos espaciales
              </Link>
              <Link to={full}>Abrir expediente completo</Link>
              {session.isSuccess && session.data.rol !== 'consulta' && !p.archivado && (
                <Button
                  onClick={() => {
                    setComposing(true);
                    setSaved(false);
                  }}
                >
                  Registrar entrega
                </Button>
              )}
              <p>Personas, edición e historial según tu perfil.</p>
            </footer>
          </>
        )
      )}
    </aside>
  );
}
