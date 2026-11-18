import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ClipboardPlus, MapPinned, Pencil, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { management, showDay, type Detail, type Predio, type User } from '@/features/gestion/api';
import { PredioDetail } from '@/features/gestion/detail';
import { PredioForm } from '@/features/gestion/predio-form';
import { historyLabels } from '@/features/gestion/labels';
import { useWorkspaceEdits } from '@/features/gestion/workspace-edits-context';
import { ActivityComposer } from '@/features/bagua-master/components/activity-composer';
import '@/features/gestion/gestion.css';
import {
  confirmedLinkCenter,
  useSpatialLinks,
} from '@/features/bagua-master/components/spatial-links';
import { LocationMiniMap } from './location-minimap';
import { Sheet } from './sheet';
import { SessionGate } from './session';

interface UnitRow {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  activa: boolean;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
const period = (from: string, to: string | null) =>
  `${showDay(from)} ${to ? `– ${showDay(to)}` : '· sin fecha de cierre'}`;
const kind = (value: string) => value.replace(/_/g, ' ');

export function ExpedientePredioPage() {
  const { id = '' } = useParams();
  return <SessionGate>{(user) => <Dossier key={id} id={id} user={user} />}</SessionGate>;
}

type SheetKind = null | 'gestionar' | 'editar' | 'entrega';

function Dossier({ id, user }: { id: string; user: User }) {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const edits = useWorkspaceEdits();
  const heading = useRef<HTMLHeadingElement>(null);
  const [chosenSheet, setSheet] = useState<SheetKind>(null);
  const [notice, setNotice] = useState('');
  const [showAll, setShowAll] = useState(false);
  const query = useQuery({
    queryKey: ['gestion', 'predio', id],
    queryFn: ({ signal }) => management<Detail>(`/predios/${id}`, 'GET', undefined, signal),
    retry: false,
  });
  const units = useQuery({
    queryKey: ['gestion', 'unidades', id],
    queryFn: ({ signal }) =>
      management<{ items: UnitRow[] }>(`/predios/${id}/unidades`, 'GET', undefined, signal),
    enabled: query.isSuccess,
    retry: false,
  });
  const spatial = useSpatialLinks(id);
  const mutation = useMutation({
    mutationFn: ({
      path,
      data,
      method = 'POST',
    }: {
      path: string;
      data: unknown;
      method?: string;
    }) => management(path, method, data),
    onSuccess: async () => {
      edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
      setNotice('Cambios guardados. El historial del expediente ya los refleja.');
    },
  });
  const data = query.data;
  const p = data?.predio;
  const editable = user.rol !== 'consulta' && !!p && !p.archivado;
  const unitFocus = params.get('unidad');

  useEffect(() => {
    if (p) heading.current?.focus({ preventScroll: true });
  }, [p]);
  // «?accion=entrega» abre el registro de entrega con este predio ya elegido.
  const requested = params.get('accion') === 'entrega';
  const sheet: SheetKind = chosenSheet ?? (requested && editable ? 'entrega' : null);

  function closeSheet() {
    edits.run(() => {
      setSheet(null);
      mutation.reset();
      if (params.has('accion'))
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            next.delete('accion');
            return next;
          },
          { replace: true },
        );
    });
  }

  const timeline = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.entregas.map((entry) => ({
        key: `e-${entry.id}`,
        when: entry.fecha.slice(0, 10),
        title: `Entrega · ${entry.material}`,
        detail: `${entry.servicio} · ${
          entry.cantidad === null ? 'sin medición' : `${entry.cantidad} ${entry.unidad}`
        }${entry.anulada ? ` · anulada: ${entry.motivo_anulacion ?? 'sin motivo'}` : ''}`,
        void: entry.anulada,
      })),
      ...data.historial.map((entry) => ({
        key: `h-${entry.id}`,
        when: entry.creado_en.slice(0, 10),
        title: historyLabels[entry.accion] ?? entry.accion.replaceAll('.', ' · '),
        detail: `Registrado por ${entry.responsable}`,
        void: false,
      })),
    ];
    return items.sort((a, b) => b.when.localeCompare(a.when));
  }, [data]);

  if (query.isPending)
    return (
      <div className="pr-page">
        <div className="pr-container" role="status" aria-label="Cargando expediente">
          <div className="pr-skeleton" style={{ height: 14, width: 220 }} />
          <div className="pr-skeleton" style={{ height: 260, marginTop: 20 }} />
          <div className="pr-skeleton" style={{ height: 120, marginTop: 20 }} />
        </div>
      </div>
    );
  if (query.isError || !data || !p) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="pr-page">
        <div className="pr-container" role="alert">
          <div className="pr-card pr-empty">
            <strong>
              {missing ? 'No se encontró este expediente' : 'No se pudo abrir el expediente'}
            </strong>
            {missing
              ? 'Puede haber sido archivado o el enlace es antiguo. Búscalo de nuevo por código o dirección.'
              : 'Revisa tu conexión e inténtalo nuevamente.'}
            <div style={{ marginTop: 10 }}>
              {missing ? (
                <Button asChild variant="outline">
                  <Link to="/bagua-master/expedientes">Volver a Expedientes</Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Reintentar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const adminPoint = p.ubicacion?.coordinates ?? null;
  const linkedPoint = adminPoint ? null : confirmedLinkCenter(spatial.data?.items);
  const point = adminPoint ?? linkedPoint;
  const activeDeliveries = data.entregas.filter((entry) => !entry.anulada).length;
  const unitCount = units.data?.items.filter((unit) => unit.activa).length;
  const visible = showAll ? timeline : timeline.slice(0, 8);
  const mapHref = `/bagua-master?predio=${p.id}`;
  const goTo = (anchor: string) =>
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="pr-page pr-embed">
      <div className="pr-container">
        <nav className="pr-breadcrumb" aria-label="Ruta de navegación">
          <Link to="/bagua-master/expedientes">Expedientes</Link>
          <span aria-hidden="true">/</span>
          <span>Predio {p.codigo}</span>
        </nav>

        {notice && (
          <p className="pr-notice is-info" role="status" style={{ marginBottom: 16 }}>
            {notice}
          </p>
        )}
        {p.archivado && (
          <p className="pr-notice" role="status" style={{ marginBottom: 16 }}>
            Predio archivado · solo consulta. Motivo: {p.motivo_archivo ?? 'sin motivo registrado'}.
          </p>
        )}

        <div className="pr-dossier-hero">
          <section className="pr-card pr-dossier-id" aria-labelledby="dossier-title">
            <div>
              <p className="pr-eyebrow">Expediente de predio</p>
              <h1 id="dossier-title" ref={heading} tabIndex={-1}>
                Predio {p.codigo}
              </h1>
              <p>
                {p.direccion}
                {p.sector ? ` · ${p.sector}` : ''}
              </p>
              <div className="pr-chips" style={{ marginTop: 14 }}>
                {p.uso && <span className="pr-chip">{p.uso}</span>}
                {p.sintetica && <span className="pr-chip is-violet">Registro sintético</span>}
                {p.archivado && <span className="pr-chip is-warn">Archivado</span>}
              </div>
            </div>
            <div className="pr-actions">
              <Button asChild>
                <Link to={mapHref}>
                  <MapPinned /> Ver en el mapa
                </Link>
              </Button>
              {editable && (
                <Button variant="outline" onClick={() => setSheet('entrega')}>
                  <ClipboardPlus /> Registrar entrega
                </Button>
              )}
              {editable && (
                <Button variant="outline" onClick={() => setSheet('gestionar')}>
                  <SlidersHorizontal /> Gestionar relaciones
                </Button>
              )}
              {editable && (
                <Button variant="ghost" onClick={() => setSheet('editar')}>
                  <Pencil /> Editar ficha
                </Button>
              )}
            </div>
          </section>
          <LocationMiniMap
            point={point}
            state={p.estado_ubicacion}
            code={p.codigo}
            mapHref={mapHref}
            viaLink={!!linkedPoint}
            synthetic={!!p.sintetica}
          />
        </div>

        <div className="pr-card pr-stats" role="group" aria-label="Resumen del expediente">
          <button type="button" className="pr-stat" onClick={() => goTo('personas')}>
            <span className="pr-stat-value">
              {data.personasPermitidas ? data.personas.length : '—'}
            </span>
            <span className="pr-stat-label">
              {data.personasPermitidas ? 'Personas relacionadas' : 'Personas · acceso restringido'}
            </span>
          </button>
          <button type="button" className="pr-stat" onClick={() => goTo('unidades')}>
            <span className="pr-stat-value">{unitCount ?? '…'}</span>
            <span className="pr-stat-label">Unidades y secciones</span>
          </button>
          <button type="button" className="pr-stat" onClick={() => goTo('servicios')}>
            <span className="pr-stat-value">{data.asignaciones.length}</span>
            <span className="pr-stat-label">Servicios asignados</span>
          </button>
          <button type="button" className="pr-stat" onClick={() => goTo('actividad')}>
            <span className="pr-stat-value">{activeDeliveries}</span>
            <span className="pr-stat-label">Entregas registradas</span>
          </button>
        </div>

        <div className="pr-dossier-layout" style={{ marginTop: 28 }}>
          <div>
            <section
              id="personas"
              className="pr-section"
              style={{ marginTop: 0 }}
              aria-labelledby="h-personas"
            >
              <div className="pr-section-head">
                <div>
                  <h2 id="h-personas">Personas relacionadas</h2>
                  <p>Vínculos administrativos declarados; no acreditan propiedad legal.</p>
                </div>
              </div>
              <div className="pr-card">
                {!data.personasPermitidas ? (
                  <div className="pr-empty">
                    <strong>Acceso restringido</strong>
                    Tu perfil consulta predios y servicios, no identidades personales.
                  </div>
                ) : !data.personas.length ? (
                  <div className="pr-empty">
                    <strong>Sin personas vinculadas</strong>
                    Este predio aún no tiene un vínculo registrado.
                  </div>
                ) : (
                  <ul className="pr-list">
                    {data.personas.map((link) => (
                      <li key={link.id}>
                        <span className="pr-avatar-box" aria-hidden="true">
                          {initials(link.nombre)}
                        </span>
                        <div className="pr-list-main">
                          <strong>
                            <Link
                              className="pr-link"
                              to={`/bagua-master/expedientes/persona/${link.persona_id}`}
                            >
                              {link.nombre}
                            </Link>
                          </strong>
                          <span>
                            {kind(link.tipo)} · {period(link.desde, link.hasta)}
                          </span>
                        </div>
                        <span className={`pr-chip${link.hasta ? '' : ' is-info'}`}>
                          {link.hasta ? 'Cerrado' : 'Vigente'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section id="unidades" className="pr-section" aria-labelledby="h-unidades">
              <div className="pr-section-head">
                <div>
                  <h2 id="h-unidades">Unidades y secciones</h2>
                  <p>Subdivisiones administrativas del predio, sin límites cartográficos.</p>
                </div>
                {editable && (
                  <Button size="sm" variant="outline" onClick={() => setSheet('gestionar')}>
                    Gestionar
                  </Button>
                )}
              </div>
              <div className="pr-card">
                {units.isPending ? (
                  <div className="pr-empty" role="status">
                    Cargando unidades…
                  </div>
                ) : !units.data?.items.length ? (
                  <div className="pr-empty">
                    <strong>Sin unidades registradas</strong>
                    El predio se consulta como un solo registro.
                  </div>
                ) : (
                  <ul className="pr-list">
                    {units.data.items.map((unit) => (
                      <li
                        key={unit.id}
                        aria-current={unitFocus === unit.id ? 'true' : undefined}
                        style={
                          unitFocus === unit.id
                            ? { background: 'var(--status-verified-bg)' }
                            : undefined
                        }
                      >
                        <span className="pr-avatar-box pr-mono" aria-hidden="true">
                          {unit.codigo.slice(-2)}
                        </span>
                        <div className="pr-list-main">
                          <strong>{unit.nombre}</strong>
                          <span>
                            {unit.codigo} · {unit.tipo === 'seccion' ? 'Sección' : 'Unidad'}
                          </span>
                        </div>
                        <span className={`pr-chip${unit.activa ? '' : ' is-warn'}`}>
                          {unit.activa ? 'Activa' : 'Inactiva'}
                        </span>
                        <Link
                          className="pr-link"
                          to={`/bagua-master?predio=${p.id}&unidad=${unit.id}`}
                        >
                          Ver
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section id="servicios" className="pr-section" aria-labelledby="h-servicios">
              <div className="pr-section-head">
                <div>
                  <h2 id="h-servicios">Servicios de recolección</h2>
                  <p>Asignación, participación y entrega son registros distintos.</p>
                </div>
              </div>
              <div className="pr-card">
                {!data.asignaciones.length && !data.participaciones.length ? (
                  <div className="pr-empty">
                    <strong>Sin servicios registrados</strong>
                    «Sin registro» no significa «sin servicio»: puede estar pendiente de cargar.
                  </div>
                ) : (
                  <ul className="pr-list">
                    {data.asignaciones.map((a) => (
                      <li key={`a-${a.id}`}>
                        <div className="pr-list-main">
                          <strong>{a.nombre}</strong>
                          <span>Asignación · {period(a.desde, a.hasta)}</span>
                        </div>
                        <span className={`pr-chip${a.estado === 'activa' ? ' is-info' : ''}`}>
                          {a.estado}
                        </span>
                        <Link
                          className="pr-link"
                          to={`/bagua-master/servicios?servicio=${a.servicio_id}&operacion=asignaciones`}
                        >
                          Servicio
                        </Link>
                      </li>
                    ))}
                    {data.participaciones.map((a) => (
                      <li key={`p-${a.id}`}>
                        <div className="pr-list-main">
                          <strong>{a.nombre}</strong>
                          <span>
                            Participación · {period(a.desde, a.hasta)} ·{' '}
                            {
                              data.entregas.filter((e) => e.servicio === a.nombre && !e.anulada)
                                .length
                            }{' '}
                            entregas
                          </span>
                        </div>
                        <span className={`pr-chip${a.hasta ? '' : ' is-violet'}`}>
                          {a.hasta ? 'Cerrada' : 'Participa'}
                        </span>
                        <Link
                          className="pr-link"
                          to={`/bagua-master/servicios?servicio=${a.servicio_id}&operacion=entregas`}
                        >
                          Actividad
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section id="actividad" className="pr-section" aria-labelledby="h-actividad">
              <div className="pr-section-head">
                <div>
                  <h2 id="h-actividad">Actividad e historial</h2>
                  <p>Entregas y cambios registrados, de más reciente a más antigua.</p>
                </div>
                {editable && (
                  <Button size="sm" onClick={() => setSheet('entrega')}>
                    <ClipboardPlus /> Registrar entrega
                  </Button>
                )}
              </div>
              <div className="pr-card">
                {!timeline.length ? (
                  <div className="pr-empty">
                    <strong>Sin actividad registrada</strong>
                    Las entregas y cambios aparecerán aquí con su fecha.
                  </div>
                ) : (
                  <>
                    <ol className="pr-timeline">
                      {visible.map((entry) => (
                        <li key={entry.key} className={entry.void ? 'is-void' : undefined}>
                          <strong>{entry.title}</strong>
                          <span>
                            {showDay(entry.when)} · {entry.detail}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {timeline.length > 8 && (
                      <div style={{ padding: '0 20px 16px' }}>
                        <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                          {showAll ? 'Mostrar menos' : `Ver los ${timeline.length} registros`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>

          <aside className="pr-dossier-aside" aria-label="Contexto del expediente">
            <section className="pr-card" aria-labelledby="h-cadena">
              <div className="pr-section-head" style={{ padding: '16px 20px 0', margin: 0 }}>
                <h2 id="h-cadena">Cadena de información</h2>
              </div>
              <ol className="pr-list" style={{ padding: '4px 0 8px' }}>
                {[
                  [
                    'personas',
                    'Persona o contribuyente',
                    data.personasPermitidas ? `${data.personas.length} vínculos` : 'restringido',
                  ],
                  ['unidades', 'Predio y sus unidades', `${unitCount ?? '…'} unidades`],
                  [
                    'servicios',
                    'Servicios y participación',
                    `${data.asignaciones.length} asignados`,
                  ],
                  ['servicios', 'Rutas y horarios', 'sin vínculo documentado'],
                  ['actividad', 'Entregas e historial', `${activeDeliveries} entregas`],
                ].map(([anchor, label, count], index) => (
                  <li key={`${anchor}-${index}`} style={{ padding: '9px 20px' }}>
                    <span
                      className="pr-avatar-box pr-mono"
                      aria-hidden="true"
                      style={{ width: 24, height: 24 }}
                    >
                      {index + 1}
                    </span>
                    <div className="pr-list-main">
                      <strong style={{ fontSize: 13 }}>
                        <button
                          type="button"
                          className="pr-link-button"
                          style={{ textDecoration: 'none', color: 'inherit', fontWeight: 500 }}
                          onClick={() => goTo(anchor!)}
                        >
                          {label}
                        </button>
                      </strong>
                      <span>{count}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="pr-card" aria-labelledby="h-fuente">
              <div className="pr-section-head" style={{ padding: '16px 20px 0', margin: 0 }}>
                <h2 id="h-fuente">Ubicación y fuente</h2>
              </div>
              <dl className="pr-kv">
                <div>
                  <dt>Estado de la ubicación</dt>
                  <dd>
                    {p.estado_ubicacion}
                    {p.evidencia_ubicacion ? ` · ${p.evidencia_ubicacion}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Fuente del registro</dt>
                  <dd>{p.sintetica ? 'Datos sintéticos de ensayo' : p.fuente}</dd>
                </div>
                <div>
                  <dt>Código en la fuente</dt>
                  <dd className="pr-mono">{p.fuente_codigo || p.codigo}</dd>
                </div>
                <div>
                  <dt>Última actualización</dt>
                  <dd>{showDay(p.actualizado_en)}</dd>
                </div>
                {p.observaciones && (
                  <div>
                    <dt>Observaciones</dt>
                    <dd>{p.observaciones}</dd>
                  </div>
                )}
              </dl>
              <div style={{ padding: '0 20px 18px' }}>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/bagua-master?predio=${p.id}&espacial=revision`}>
                    Revisar vínculos espaciales <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            </section>
            {p.sintetica && (
              <p className="pr-notice">
                Registro de demostración. No representa a un ocupante real ni tiene validez
                municipal.
              </p>
            )}
          </aside>
        </div>
      </div>

      <Sheet
        open={sheet === 'entrega'}
        title="Registrar entrega"
        description="Registra una entrega de este predio. Se guarda con fecha, responsable e historial."
        onClose={closeSheet}
      >
        <ActivityComposer
          data={data}
          onClose={closeSheet}
          onSaved={() => {
            setSheet(null);
            setNotice('Entrega guardada · ya aparece en la actividad del expediente.');
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                next.delete('accion');
                return next;
              },
              { replace: true },
            );
          }}
        />
      </Sheet>
      <Sheet
        open={sheet === 'gestionar'}
        title="Gestionar relaciones y servicios"
        description="Vincula personas, asigna servicios y registra participación o entregas de este predio."
        onClose={closeSheet}
      >
        {mutation.isError && (
          <p role="alert" className="pr-error" style={{ marginBottom: 12 }}>
            {mutation.error.message}
          </p>
        )}
        <div data-unsaved-form>
          <PredioDetail
            data={data}
            user={user}
            onEdit={() => setSheet('editar')}
            save={(path, body) => mutation.mutateAsync({ path, data: body })}
            pending={mutation.isPending}
          />
        </div>
      </Sheet>
      <Sheet
        open={sheet === 'editar'}
        title="Editar ficha del predio"
        description="Modifica los datos del predio. Se conserva el historial de cambios."
        onClose={closeSheet}
      >
        {mutation.isError && (
          <p role="alert" className="pr-error" style={{ marginBottom: 12 }}>
            {mutation.error.message}
          </p>
        )}
        <PredioForm
          predio={p as Predio}
          pending={mutation.isPending}
          onCancel={closeSheet}
          onSave={(body) =>
            void mutation
              .mutateAsync({
                path: `/predios/${p.id}`,
                method: 'PUT',
                data: { datos: body, version: p.version },
              })
              .then(() => setSheet(null))
              .catch(() => undefined)
          }
        />
      </Sheet>
    </div>
  );
}
