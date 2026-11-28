import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Flag,
  MapPin,
  Play,
  RotateCcw,
  Truck,
} from 'lucide-react';
import { management, type User } from '@/features/gestion/api';
import { SessionGate } from '@/features/product/session';
import { dismissRejected, enqueue, flush, useQueue } from '@/lib/cola-envios';
import {
  AVISO_TIPO,
  DESTINO_NOMBRE,
  DESTINO_TEXTO,
  delayMinutes,
  delayText,
  delayTone,
  limaTime,
  limaToday,
  longDay,
  toMinutes,
  type Aviso,
  type EventoRuta,
  type ProgramaDia,
  shortName,
} from './tipos';
import './operacion.css';

// Ruta del vehículo desde el celular del chofer: tres botones grandes (Salí, Pasé por aquí,
// Llegué), con la hora y la posición del teléfono y sin escribir nada. Funciona sin señal: los
// registros se guardan en el teléfono y se envían solos al volver la conexión.

interface DiaData {
  fecha: string;
  programas: ProgramaDia[];
  avisos: (Aviso & { programaciones: string[] })[];
}
const PROBLEMAS = [
  'Avería del vehículo',
  'Llanta pinchada',
  'Lluvia intensa: calles anegadas',
  'Calle bloqueada',
  'Falta de combustible',
];
const BAGUA = { lon: [-78.75, -78.3], lat: [-5.9, -5.4] } as const;

function store(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: la elección dura mientras la página esté abierta */
  }
  return null;
}
function cached(fecha: string): DiaData | undefined {
  try {
    const raw = store(`bagua-ruta-dia-${fecha}`);
    return raw ? (JSON.parse(raw) as DiaData) : undefined;
  } catch {
    return undefined;
  }
}
type Fix = { lon: number; lat: number; precision: number; at: number };
/**
 * Posición del teléfono seguida en segundo plano mientras la pantalla está abierta. Al tocar un
 * botón se usa la última posición reciente (menos de 2 minutos): el registro nunca espera al GPS.
 * Fuera de Bagua o sin permiso, se registra sin posición.
 */
function useLastPosition() {
  const last = useRef<Fix | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const { longitude: lon, latitude: lat, accuracy } = p.coords;
        const inside =
          lon >= BAGUA.lon[0] && lon <= BAGUA.lon[1] && lat >= BAGUA.lat[0] && lat <= BAGUA.lat[1];
        last.current = inside
          ? { lon, lat, precision: Math.round(accuracy), at: Date.now() }
          : null;
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return useCallback(() => {
    const fix = last.current;
    return fix && Date.now() - fix.at < 120_000 ? fix : null;
  }, []);
}

export function ChoferPage() {
  return <SessionGate>{(user) => <Chofer user={user} />}</SessionGate>;
}

function Chofer({ user }: { user: User }) {
  const fecha = limaToday();
  const client = useQueryClient();
  const send = useCallback((path: string, body: unknown) => management(path, 'POST', body), []);
  const queue = useQueue(send);
  const position = useLastPosition();
  const [chosen, setChosen] = useState<string | null>(() => store(`bagua-mi-ruta-${fecha}`));
  const [otherPoint, setOtherPoint] = useState(false);
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['gestion', 'ruta-dia', fecha],
    queryFn: async ({ signal }) => {
      const data = await management<DiaData>(`/ruta/dia?fecha=${fecha}`, 'GET', undefined, signal);
      store(`bagua-ruta-dia-${fecha}`, JSON.stringify(data));
      return data;
    },
    initialData: () => cached(fecha),
    refetchInterval: 60_000,
    retry: false,
  });
  const program = query.data?.programas.find((p) => p.id === chosen) ?? null;
  const group = program ? `ruta:${program.id}:${fecha}` : '';
  const pending = useMemo(
    () => queue.pendientes.filter((item) => item.grupo === group),
    [queue.pendientes, group],
  );
  const claveKey = program ? `bagua-ruta-clave-${program.id}-${fecha}` : '';
  const handle = program?.ejecucion?.id ?? (claveKey ? store(claveKey) : null);

  // Eventos: los del servidor más los que esperan señal en el teléfono.
  const events: EventoRuta[] = useMemo(() => {
    const local = pending
      .map((item) => item.body as Record<string, unknown>)
      .filter((b) => typeof b.momento === 'string')
      .map((b) => ({
        id: String(b.clave),
        tipo: (b.tipo ?? 'salida') as EventoRuta['tipo'],
        momento: String(b.momento),
        puntoId: (b.puntoId as string) ?? null,
        destino: b.tipo === 'llegada' ? (program?.destino ?? null) : null,
        pendiente: true,
      }));
    return [...(program?.ejecucion?.eventos ?? []), ...local].sort((a, b) =>
      a.momento.localeCompare(b.momento),
    );
  }, [pending, program]);
  const interrupted =
    program?.ejecucion?.estado === 'interrumpida' &&
    !pending.some((p) => p.path.endsWith('/reanudar'));
  const locallyInterrupted = pending.some((p) => p.path.endsWith('/interrumpir'));
  const started = events.some((e) => e.tipo === 'salida');
  const last = events.at(-1);
  const arrived = last?.tipo === 'llegada';
  const passed = new Set(events.filter((e) => e.tipo === 'paso').map((e) => e.puntoId));
  const points = program?.puntos ?? [];
  const lastPassed = [...events].reverse().find((e) => e.tipo === 'paso');
  const lastOrder = points.find((p) => p.id === lastPassed?.puntoId)?.orden ?? 0;
  const next =
    points.find((p) => p.orden > lastOrder && !passed.has(p.id)) ??
    points.find((p) => !passed.has(p.id)) ??
    null;
  const notices = (query.data?.avisos ?? []).filter(
    (a) => !a.programaciones.length || (program && a.programaciones.includes(program.id)),
  );
  const suspendedToday = notices.some(
    (a) => a.tipo === 'suspension' && a.desde <= fecha && a.hasta >= fecha,
  );

  async function record(kind: 'salida' | 'paso' | 'llegada', puntoId?: string) {
    if (!program) return;
    setBusy(true);
    try {
      const where = position();
      const momento = new Date().toISOString();
      const clave = crypto.randomUUID();
      const coords = where ? { lon: where.lon, lat: where.lat, precision: where.precision } : {};
      const hora = limaTime(momento);
      if (kind === 'salida') {
        store(claveKey, clave);
        enqueue({
          id: clave,
          grupo: group,
          path: '/ruta/salida',
          label: `Salida · ${hora}`,
          body: { clave, programacionId: program.id, fecha, momento, ...coords },
        });
      } else {
        const ref = handle ?? store(claveKey);
        if (!ref) return;
        const punto = points.find((p) => p.id === puntoId);
        enqueue({
          id: clave,
          grupo: group,
          path: `/ruta/ejecuciones/${ref}/eventos`,
          label:
            kind === 'paso'
              ? `Paso por ${punto?.nombre ?? 'punto'} · ${hora}`
              : `Llegada al ${DESTINO_NOMBRE[program.destino]} · ${hora}`,
          body: { clave, tipo: kind, momento, ...(puntoId ? { puntoId } : {}), ...coords },
        });
      }
      setOtherPoint(false);
      await flush(send);
      await client.invalidateQueries({ queryKey: ['gestion', 'ruta-dia', fecha] });
    } finally {
      setBusy(false);
    }
  }
  async function report(motivo: string | null) {
    const ref = handle ?? store(claveKey);
    if (!program || !ref) return;
    const id = crypto.randomUUID();
    enqueue(
      motivo
        ? {
            id,
            grupo: group,
            path: `/ruta/ejecuciones/${ref}/interrumpir`,
            label: `Problema: ${motivo}`,
            body: { motivo },
          }
        : {
            id,
            grupo: group,
            path: `/ruta/ejecuciones/${ref}/reanudar`,
            label: 'Ruta reanudada',
            body: {},
          },
    );
    setProblem(false);
    await flush(send);
    await client.invalidateQueries({ queryKey: ['gestion', 'ruta-dia', fecha] });
  }
  function choose(id: string | null) {
    store(`bagua-mi-ruta-${fecha}`, id);
    setChosen(id);
  }

  if (user.rol === 'consulta')
    return (
      <div className="pr-page">
        <div className="pr-container">
          <div className="pr-card pr-empty">
            <strong>Ruta del vehículo</strong>
            Tu perfil es de consulta: la ruta la registran los choferes.
          </div>
        </div>
      </div>
    );

  const nowMin = toMinutes(limaTime(new Date().toISOString()));
  return (
    <div className="ch-page" data-testid="chofer">
      <header className="ch-head">
        <Link to="/bagua-master/campo" className="ch-back">
          <ArrowLeft size={16} aria-hidden="true" /> Campo
        </Link>
        <div>
          <p className="pr-eyebrow">Ruta del vehículo</p>
          <h1>{program ? shortName(program.nombre) : 'Mi ruta de hoy'}</h1>
          <p className="ch-fecha">{longDay(fecha)}</p>
        </div>
        <QueueChip count={queue.pendientes.length} sending={queue.enviando} />
      </header>

      {query.isError && !query.data && (
        <p role="alert" className="ch-alerta">
          No se pudo cargar la ruta y no hay una copia guardada en este teléfono. Revisa la señal.
        </p>
      )}
      {query.isPending && !query.data && <p role="status">Cargando las rutas de hoy…</p>}

      {query.data && !program && (
        <section aria-labelledby="ch-elige">
          <h2 id="ch-elige" className="ch-sub">
            ¿Qué ruta haces hoy?
          </h2>
          {query.data.programas.length === 0 && (
            <div className="pr-card pr-empty">
              <strong>No hay rutas programadas hoy</strong>Revisa la programación con tu supervisor.
            </div>
          )}
          <ul className="ch-elegir">
            {query.data.programas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  style={{ borderLeftColor: p.color }}
                >
                  <strong>{shortName(p.nombre)}</strong>
                  <span>
                    {p.horaInicio}–{p.horaFin} · {p.vehiculo}
                  </span>
                  {p.ejecucion && (
                    <span className="ch-elegir-estado">
                      {p.ejecucion.estado === 'completada'
                        ? 'Terminada'
                        : p.ejecucion.estado === 'interrumpida'
                          ? 'Interrumpida'
                          : `En ruta · ${p.ejecucion.conductor.split(' · ')[0]}`}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {program && (
        <>
          <section className="ch-ruta" style={{ borderTopColor: program.color }}>
            <div className="ch-ruta-datos">
              <span>
                <Truck size={15} aria-hidden="true" /> {program.vehiculo}
              </span>
              <span>
                Horario {program.horaInicio}–{program.horaFin}
              </span>
            </div>
            <button type="button" className="pr-link-button" onClick={() => choose(null)}>
              Cambiar de ruta
            </button>
          </section>

          {notices.map((a) => (
            <p key={a.id} className={`ch-aviso ${a.tipo === 'suspension' ? 'is-warn' : ''}`}>
              <strong>
                {AVISO_TIPO[a.tipo]} · {a.titulo}
              </strong>
              {a.mensaje}
            </p>
          ))}

          <section className="ch-accion" aria-live="polite">
            {interrupted || locallyInterrupted ? (
              <>
                <p className="ch-estado is-danger">
                  <AlertTriangle size={18} aria-hidden="true" /> Ruta interrumpida
                  {program.ejecucion?.motivoInterrupcion
                    ? ` · ${program.ejecucion.motivoInterrupcion}`
                    : ''}
                </p>
                <button
                  type="button"
                  className="ch-boton is-primario"
                  disabled={busy}
                  onClick={() => void report(null)}
                >
                  <RotateCcw size={22} aria-hidden="true" /> Reanudar la ruta
                </button>
              </>
            ) : !started ? (
              <>
                <p className="ch-siguiente">
                  <span>Salida programada</span>
                  <strong>{program.horaInicio}</strong>
                  {suspendedToday && <em>Hoy hay un aviso de suspensión para esta ruta.</em>}
                </p>
                <button
                  type="button"
                  className="ch-boton is-primario"
                  disabled={busy}
                  onClick={() => void record('salida')}
                  data-testid="ch-sali"
                >
                  <Play size={24} aria-hidden="true" /> Salí
                </button>
              </>
            ) : (
              <>
                {arrived && (
                  <p className="ch-estado is-ok">
                    <CheckCircle2 size={18} aria-hidden="true" /> Llegaste al{' '}
                    {DESTINO_NOMBRE[program.destino]} a las {limaTime(last!.momento)}.
                    {next ? ' Si haces otro viaje, sigue marcando los puntos.' : ''}
                  </p>
                )}
                {next && (
                  <>
                    <p className="ch-siguiente">
                      <span>Siguiente punto</span>
                      <strong>{next.nombre}</strong>
                      <em>
                        Programado {next.hora}
                        {nowMin > toMinutes(next.hora) + 5
                          ? ` · vas ${nowMin - toMinutes(next.hora)} min tarde`
                          : ''}
                      </em>
                    </p>
                    <button
                      type="button"
                      className="ch-boton is-primario"
                      disabled={busy}
                      onClick={() => void record('paso', next.id)}
                      data-testid="ch-pase"
                    >
                      <MapPin size={24} aria-hidden="true" /> Pasé por aquí
                    </button>
                    <button
                      type="button"
                      className="ch-enlace"
                      onClick={() => setOtherPoint((v) => !v)}
                      aria-expanded={otherPoint}
                    >
                      Pasé por otro punto
                    </button>
                    {otherPoint && (
                      <ul className="ch-otros">
                        {points
                          .filter((p) => !passed.has(p.id))
                          .map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void record('paso', p.id)}
                              >
                                <span>{p.orden}</span> {p.nombre} <em>{p.hora}</em>
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className={`ch-boton ${next ? 'is-secundario' : 'is-primario'}`}
                  disabled={busy}
                  onClick={() => void record('llegada')}
                  data-testid="ch-llegue"
                >
                  <Flag size={22} aria-hidden="true" /> {DESTINO_TEXTO[program.destino]}
                </button>
                <button
                  type="button"
                  className="ch-enlace is-peligro"
                  onClick={() => setProblem((v) => !v)}
                  aria-expanded={problem}
                >
                  Reportar un problema
                </button>
                {problem && (
                  <ul className="ch-otros">
                    {PROBLEMAS.map((m) => (
                      <li key={m}>
                        <button type="button" onClick={() => void report(m)}>
                          {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <Rejected items={queue.rechazados.filter((r) => r.grupo === group)} />

          <section aria-labelledby="ch-puntos">
            <h2 id="ch-puntos" className="ch-sub">
              Puntos de control · {passed.size} de {points.length}
            </h2>
            <ol className="ch-puntos">
              {events
                .filter((e) => e.tipo === 'salida')
                .map((e) => (
                  <li key={e.id} className="is-hecho">
                    <span className="ch-punto-hora">{limaTime(e.momento)}</span>
                    <span>
                      Salida{' '}
                      <em
                        className={`ch-delay ${delayTone(delayMinutes(e.momento, program.horaInicio))}`}
                      >
                        {delayText(delayMinutes(e.momento, program.horaInicio))}
                      </em>
                      {e.pendiente && <CloudOff size={13} aria-label="Por enviar" />}
                    </span>
                  </li>
                ))}
              {points.map((p) => {
                const ev = events.find((e) => e.tipo === 'paso' && e.puntoId === p.id);
                const delay = ev ? delayMinutes(ev.momento, p.hora) : null;
                return (
                  <li
                    key={p.id}
                    className={ev ? 'is-hecho' : next?.id === p.id ? 'is-siguiente' : ''}
                  >
                    <span className="ch-punto-hora">{ev ? limaTime(ev.momento) : p.hora}</span>
                    <span>
                      {p.nombre}{' '}
                      {ev ? (
                        <em className={`ch-delay ${delayTone(delay)}`}>{delayText(delay)}</em>
                      ) : (
                        <em className="ch-delay">programado</em>
                      )}
                      {ev?.pendiente && <CloudOff size={13} aria-label="Por enviar" />}
                    </span>
                  </li>
                );
              })}
              {events
                .filter((e) => e.tipo === 'llegada')
                .map((e) => (
                  <li key={e.id} className="is-hecho">
                    <span className="ch-punto-hora">{limaTime(e.momento)}</span>
                    <span>
                      Llegada al {DESTINO_NOMBRE[program.destino]}
                      {e.pendiente && <CloudOff size={13} aria-label="Por enviar" />}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function QueueChip({ count, sending }: { count: number; sending: boolean }) {
  return (
    <span
      className={`ch-cola ${count ? 'is-pendiente' : ''}`}
      role="status"
      data-testid="ch-cola"
      title={count ? 'Se enviarán solos al volver la señal' : 'Todo enviado'}
    >
      {count ? (
        <>
          <CloudOff size={14} aria-hidden="true" />
          {sending ? 'Enviando…' : `${count} por enviar`}
        </>
      ) : (
        <>
          <CheckCircle2 size={14} aria-hidden="true" /> Todo enviado
        </>
      )}
    </span>
  );
}

function Rejected({ items }: { items: { id: string; label: string; error?: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="ch-rechazados" role="alert">
      {items.map((item) => (
        <li key={item.id}>
          <span>
            <strong>{item.label}</strong> no se guardó: {item.error}
          </span>
          <button type="button" className="pr-link-button" onClick={() => dismissRejected(item.id)}>
            Entendido
          </button>
        </li>
      ))}
    </ul>
  );
}
