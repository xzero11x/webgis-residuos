import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock3,
  CloudOff,
  QrCode as QrIcon,
  ScanLine,
  Search,
  Truck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { management, type User } from '@/features/gestion/api';
import { formatDays } from '@/features/bagua-master/components/service-format';
import { SessionGate } from './session';
import { DeliveryForm } from './delivery-form';
import { QrScanner } from '@/features/qr/qr-scanner';
import { QrVisit } from '@/features/qr/qr-visit';
import { Empadronar } from '@/features/padron/empadronar';
import { enqueue, isOffline, useQueue } from '@/lib/cola-envios';

// Recorrido de campo: lista del día por hora estimada de paso y registro de la visita en uno o dos
// toques (entregó con materiales y kilos, no entregó o ausente). Pensado para el celular.

type Kind = 'organicos' | 'reciclables';
type Result = 'entrego' | 'no_entrego' | 'ausente';
interface Program {
  id: string;
  ruta: string;
  rutaNombre: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  operador: string;
}
interface Participant {
  participacionId: string;
  codigoPadron: string | null;
  tipoGenerador: string | null;
  establecimiento: string | null;
  predioId: string;
  predioCodigo: string;
  direccion: string;
  sector: string | null;
  representante: string | null;
  horaEstimada: string | null;
  visitaId: string | null;
  resultado: Result | null;
  entregas: { material: string; cantidad: number | null }[];
  historial: Result[];
}
interface Route {
  fecha: string;
  programas: Program[];
  participantes: Participant[];
}

const SCHEDULE: Record<Kind, number[]> = { organicos: [2, 5], reciclables: [3, 6] };
const RESULT_LABEL: Record<Result, string> = {
  entrego: 'Entregó',
  no_entrego: 'No entregó',
  ausente: 'Ausente',
};
const limaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

export function CampoPage() {
  return <SessionGate>{(user) => <Campo user={user} />}</SessionGate>;
}

function Campo({ user }: { user: User }) {
  const [kind, setKind] = useState<Kind>('organicos');
  const [date, setDate] = useState(limaToday());
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const send = useCallback((path: string, body: unknown) => management(path, 'POST', body), []);
  const queue = useQueue(send);
  const group = `campo:${kind}:${date}`;
  // Visitas registradas sin señal: se ven como hechas y se envían solas al volver la conexión.
  const pendingVisits = useMemo(
    () =>
      new Map(
        queue.pendientes
          .filter((item) => item.grupo === group)
          .map((item) => {
            const body = item.body as { participacionId: string; resultado: Result };
            return [body.participacionId, body.resultado] as const;
          }),
      ),
    [queue.pendientes, group],
  );
  const qrCode = params.get('qr');
  const qrVia = params.get('via') === 'codigo' ? 'codigo' : 'qr';
  const client = useQueryClient();
  const readOnly = user.rol === 'consulta';
  const cacheKey = `bagua-campo-${kind}-${date}`;
  const query = useQuery({
    queryKey: ['gestion', 'campo', kind, date],
    queryFn: async ({ signal }) => {
      const data = await management<Route>(
        `/campo?${new URLSearchParams({ servicio: kind, fecha: date })}`,
        'GET',
        undefined,
        signal,
      );
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        /* sin almacenamiento: el recorrido no queda guardado para usarlo sin señal */
      }
      return data;
    },
    initialData: () => {
      try {
        const raw = localStorage.getItem(cacheKey);
        return raw ? (JSON.parse(raw) as Route) : undefined;
      } catch {
        return undefined;
      }
    },
    enabled: !readOnly,
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (body: {
      participacionId: string;
      resultado: Result;
      entregas: { material: string; cantidad: number | null }[];
    }) => {
      const full = {
        clave: crypto.randomUUID(),
        fecha: date,
        observaciones: '',
        origen: 'lista',
        ...body,
      };
      try {
        return await management('/visitas', 'POST', full);
      } catch (error) {
        if (!isOffline(error)) throw error;
        const who = query.data?.participantes.find(
          (p) => p.participacionId === body.participacionId,
        );
        enqueue({
          id: full.clave,
          grupo: group,
          path: '/visitas',
          label: `Visita a ${who?.direccion ?? 'participante'} · ${RESULT_LABEL[body.resultado]}`,
          body: full,
        });
        return null;
      }
    },
    onSuccess: () => {
      setOpen(null);
      void client.invalidateQueries({ queryKey: ['gestion', 'campo', kind, date] });
      void client.invalidateQueries({ queryKey: ['gestion', 'operacion'] });
    },
  });
  const undo = useMutation({
    mutationFn: (visitId: string) =>
      management(`/visitas/${visitId}/anular`, 'POST', {
        motivo: 'Corregido en campo: registrado por error',
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['gestion', 'campo', kind, date] }),
  });

  const people = useMemo(() => query.data?.participantes ?? [], [query.data]);
  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term
      ? people.filter((p) =>
          [p.direccion, p.codigoPadron, p.representante, p.establecimiento, p.sector]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term)),
        )
      : people;
  }, [people, filter]);
  const done = people.filter((p) => p.resultado || pendingVisits.has(p.participacionId)).length;
  const delivered = people.filter(
    (p) => (p.resultado ?? pendingVisits.get(p.participacionId)) === 'entrego',
  ).length;

  if (readOnly)
    return (
      <div className="pr-page">
        <div className="pr-container">
          <div className="pr-card pr-empty">
            <strong>Recorrido de campo</strong>
            Tu perfil es de consulta: el registro de visitas corresponde a promotores y
            recicladores.
          </div>
        </div>
      </div>
    );

  return (
    <div className="pr-page pr-embed cp-page">
      <div className="pr-container cp-container">
        <header className="cp-head">
          <p className="pr-eyebrow">Recorrido de campo</p>
          <h1>Registrar visitas</h1>
          <div className="cp-controls">
            <div className="pr-segmented" role="group" aria-label="Servicio">
              {(['organicos', 'reciclables'] as Kind[]).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k === 'organicos' ? 'Orgánicos' : 'Reciclables'}
                </button>
              ))}
            </div>
            <input
              type="date"
              aria-label="Fecha del recorrido"
              value={date}
              max={limaToday()}
              onChange={(event) => event.target.value && setDate(event.target.value)}
            />
          </div>
          <div className="cp-qr">
            <button
              type="button"
              className="cp-escanear"
              onClick={() => setScanning(true)}
              data-testid="cp-escanear"
            >
              <ScanLine size={18} aria-hidden="true" /> Escanear sticker QR
            </button>
            <Link to="/bagua-master/campo/etiquetas" className="cp-stickers">
              <QrIcon size={15} aria-hidden="true" /> Stickers
            </Link>
            <Link
              to="/bagua-master/campo/ruta"
              className="cp-stickers"
              data-testid="cp-ruta-vehiculo"
            >
              <Truck size={15} aria-hidden="true" /> Ruta del vehículo
            </Link>
            <button
              type="button"
              className="cp-stickers"
              onClick={() => setEnrolling(true)}
              data-testid="cp-inscribir"
            >
              <UserPlus size={15} aria-hidden="true" /> Inscribir vecino
            </button>
          </div>
          {queue.pendientes.length > 0 && (
            <p className="cp-programa" role="status" data-testid="cp-cola">
              <CloudOff size={14} aria-hidden="true" /> {queue.pendientes.length} registro(s) sin
              señal: se enviarán solos al volver la conexión.
            </p>
          )}
          {query.data?.programas.map((p) => (
            <p key={p.id} className="cp-programa">
              <Clock3 size={14} aria-hidden="true" /> {p.nombre} · {p.rutaNombre.split(' · ')[0]} ·{' '}
              {p.horaInicio}–{p.horaFin}
            </p>
          ))}
        </header>
        {scanning && (
          <QrScanner
            onClose={() => setScanning(false)}
            onCode={(code, via) => {
              setScanning(false);
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set('qr', code);
                next.set('via', via);
                return next;
              });
            }}
          />
        )}
        <Empadronar open={enrolling} onClose={() => setEnrolling(false)} initialKind={kind} />
        {qrCode && (
          <QrVisit
            code={qrCode}
            date={date}
            via={qrVia}
            onClose={() =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.delete('qr');
                next.delete('via');
                return next;
              })
            }
            onSaved={() =>
              void client.invalidateQueries({ queryKey: ['gestion', 'campo', kind, date] })
            }
          />
        )}

        {query.isPending && <p role="status">Cargando el recorrido…</p>}
        {query.isError && <p role="alert">No se pudo cargar el recorrido.</p>}
        {query.data && query.data.programas.length === 0 && (
          <div className="pr-card pr-empty" data-testid="cp-sin-programa">
            <strong>No hay recolección programada ese día</strong>
            {kind === 'organicos' ? 'Orgánicos' : 'Reciclables'} se recogen los días{' '}
            {formatDays(SCHEDULE[kind])}. Elige otra fecha.
          </div>
        )}
        {query.data && query.data.programas.length > 0 && (
          <>
            <div className="cp-progreso" role="status">
              <div className="cp-barra">
                <span style={{ width: `${people.length ? (100 * done) / people.length : 0}%` }} />
              </div>
              <span>
                <strong>{done}</strong> de {people.length} visitados · <strong>{delivered}</strong>{' '}
                entregaron
              </span>
            </div>
            <label className="cp-buscar">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar dirección, código o nombre"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            {save.isError && (
              <p role="alert" className="cp-error">
                {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
              </p>
            )}
            <ul className="cp-lista" data-testid="cp-lista">
              {visible.map((p) => (
                <li key={p.participacionId} className={p.resultado ? `is-${p.resultado}` : ''}>
                  <div className="cp-fila">
                    <span className="cp-hora">{p.horaEstimada ?? '—'}</span>
                    <div className="cp-datos">
                      <strong>{p.direccion}</strong>
                      <span>
                        {p.codigoPadron} ·{' '}
                        {p.establecimiento ?? p.representante ?? 'Sin representante'}
                        {p.sector ? ` · ${p.sector}` : ''}
                      </span>
                      <span className="cp-historial" aria-label="Últimas visitas">
                        {[...p.historial].reverse().map((r, i) => (
                          <i key={i} className={`pr-visita is-${r}`} title={RESULT_LABEL[r]} />
                        ))}
                        <Link to={`/bagua-master/expedientes/predio/${p.predioId}`}>
                          Expediente
                        </Link>
                      </span>
                    </div>
                  </div>
                  {!p.resultado && pendingVisits.has(p.participacionId) ? (
                    <div className="cp-hecho">
                      <span className="pr-chip is-warn">
                        {RESULT_LABEL[pendingVisits.get(p.participacionId)!]} · por enviar
                      </span>
                    </div>
                  ) : p.resultado ? (
                    <div className="cp-hecho">
                      <span className={`pr-chip ${p.resultado === 'entrego' ? 'is-violet' : ''}`}>
                        {RESULT_LABEL[p.resultado]}
                        {p.entregas.length
                          ? ` · ${p.entregas
                              .map((e) =>
                                e.cantidad ? `${e.material} ${e.cantidad} kg` : e.material,
                              )
                              .join(', ')}`
                          : ''}
                      </span>
                      <button
                        type="button"
                        className="cp-deshacer"
                        disabled={undo.isPending}
                        onClick={() => p.visitaId && undo.mutate(p.visitaId)}
                      >
                        Corregir
                      </button>
                    </div>
                  ) : open === p.participacionId ? (
                    <DeliveryForm
                      kind={kind}
                      saving={save.isPending}
                      onCancel={() => setOpen(null)}
                      onSave={(entregas) =>
                        save.mutate({
                          participacionId: p.participacionId,
                          resultado: 'entrego',
                          entregas,
                        })
                      }
                    />
                  ) : (
                    <div className="cp-acciones">
                      <button
                        type="button"
                        className="is-ok"
                        onClick={() => setOpen(p.participacionId)}
                      >
                        <Check size={16} aria-hidden="true" /> Entregó
                      </button>
                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() =>
                          save.mutate({
                            participacionId: p.participacionId,
                            resultado: 'no_entrego',
                            entregas: [],
                          })
                        }
                      >
                        <X size={16} aria-hidden="true" /> No entregó
                      </button>
                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() =>
                          save.mutate({
                            participacionId: p.participacionId,
                            resultado: 'ausente',
                            entregas: [],
                          })
                        }
                      >
                        <UserX size={16} aria-hidden="true" /> Ausente
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
