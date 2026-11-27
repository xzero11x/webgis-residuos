import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Scale, Truck } from 'lucide-react';
import { management, showDay } from '@/features/gestion/api';
import { OperacionMapa } from './mapa-operacion';
import { EjecucionSheet } from './ejecucion';
import {
  AVISO_TIPO,
  SITUACION,
  delayText,
  delayTone,
  kgText,
  limaTime,
  limaToday,
  longDay,
  type Aviso,
  type Situacion,
  shortName,
} from './tipos';

// Tablero diario del supervisor: qué rutas salieron, cuáles van atrasadas o tuvieron un problema,
// qué falta pesar y cómo fue la semana. Se actualiza solo cada minuto.

export interface RutaDia {
  id: string;
  ruta: string;
  rutaNombre: string;
  color: string;
  servicio: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  vehiculo: string;
  sectores: string[];
  puntos: number;
  ejecucionId: string | null;
  estado: string | null;
  motivoInterrupcion: string | null;
  conductor: string | null;
  salida: string | null;
  atrasoSalida: number | null;
  ultimoOrden: number | null;
  ultimoPunto: string | null;
  ultimoMomento: string | null;
  ultimoAtraso: number | null;
  pasados: number;
  llegadas: number;
  llegada: string | null;
  tickets: number;
  netoKg: number;
  lon: number | null;
  lat: number | null;
  situacion: Situacion;
}
interface Alerta {
  tipo: string;
  nivel: 'alta' | 'media' | 'baja';
  texto: string;
  ejecucionId?: string;
  programacionId?: string;
  fecha?: string;
}
interface DiaOperacion {
  fecha: string;
  hoy: string;
  rutas: RutaDia[];
  alertas: Alerta[];
  semana: {
    fecha: string;
    programadas: number;
    ejecutadas: number;
    completadas: number;
    pasos: number;
    puntuales: number;
    kg: number;
  }[];
  visitas: {
    codigo: string;
    nombre: string;
    visitas: number;
    conEntrega: number;
    promotores: number;
  }[];
  avisos: Aviso[];
}
const NIVEL: Record<Alerta['nivel'], string> = { alta: 'is-danger', media: 'is-warn', baja: '' };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function Tablero({ onGo }: { onGo: (vista: string) => void }) {
  const [fecha, setFecha] = useState(limaToday());
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['gestion', 'operacion-dia', fecha],
    queryFn: ({ signal }) =>
      management<DiaOperacion>(`/operacion/dia?fecha=${fecha}`, 'GET', undefined, signal),
    refetchInterval: 60_000,
    retry: false,
  });
  const select = useCallback((id: string) => setSelected((s) => (s === id ? null : id)), []);
  const data = query.data;
  if (query.isPending)
    return (
      <div
        className="pr-skeleton"
        style={{ height: 420 }}
        role="status"
        aria-label="Cargando el día"
      />
    );
  if (query.isError || !data)
    return (
      <p role="alert" className="pr-error">
        No se pudo cargar la operación del día.{' '}
        <button type="button" className="pr-link-button" onClick={() => void query.refetch()}>
          Reintentar
        </button>
      </p>
    );
  const rutas = data.rutas;
  const enCurso = rutas.filter((r) => r.situacion === 'en_curso').length;
  const listas = rutas.filter((r) => r.situacion === 'completada').length;
  const problemas = rutas.filter((r) =>
    ['interrumpida', 'sin_iniciar', 'no_ejecutada'].includes(r.situacion),
  ).length;
  const semana = data.semana;
  const maxKg = Math.max(1, ...semana.map((d) => d.kg));
  const totalProg = semana.reduce((n, d) => n + d.programadas, 0);
  const totalComp = semana.reduce((n, d) => n + d.completadas, 0);
  const totalPasos = semana.reduce((n, d) => n + d.pasos, 0);
  const totalPunt = semana.reduce((n, d) => n + d.puntuales, 0);

  return (
    <div className="op-tablero" data-testid="op-tablero">
      <div className="op-dia-cabecera">
        <div>
          <h2>
            {data.fecha === data.hoy ? 'Hoy' : 'Día'}, {longDay(data.fecha).toLowerCase()}
          </h2>
          <p>
            {rutas.length} rutas programadas · actualizado a las{' '}
            {limaTime(new Date(query.dataUpdatedAt).toISOString())}
          </p>
        </div>
        <input
          type="date"
          className="pr-field"
          aria-label="Día de la operación"
          value={fecha}
          max={limaToday()}
          onChange={(event) => event.target.value && setFecha(event.target.value)}
        />
      </div>

      <div className="op-kpis">
        <div className="op-kpi">
          <span>En ruta</span>
          <strong>{enCurso}</strong>
        </div>
        <div className="op-kpi is-ok">
          <span>Terminadas</span>
          <strong>
            {listas}
            <small> de {rutas.length}</small>
          </strong>
        </div>
        <div className={`op-kpi ${problemas ? 'is-danger' : ''}`}>
          <span>Con problema</span>
          <strong>{problemas}</strong>
        </div>
        <button type="button" className="op-kpi" onClick={() => onGo('pesaje')}>
          <span>Pesado en 7 días</span>
          <strong>{kgText(semana.reduce((n, d) => n + d.kg, 0))}</strong>
        </button>
        <div className="op-kpi">
          <span>Visitas selectivas</span>
          <strong>{data.visitas.reduce((n, v) => n + v.visitas, 0)}</strong>
        </div>
      </div>

      {data.alertas.length > 0 && (
        <section className="op-alertas" aria-labelledby="op-alertas-t">
          <h3 id="op-alertas-t">
            <AlertTriangle size={15} aria-hidden="true" /> Atención ({data.alertas.length})
          </h3>
          <ul>
            {data.alertas.slice(0, 12).map((a, i) => (
              <li key={i}>
                <span className={`pr-chip ${NIVEL[a.nivel]}`}>
                  {a.tipo === 'ticket'
                    ? 'Pesaje'
                    : a.tipo === 'no_ejecutada'
                      ? 'No salió'
                      : a.tipo === 'atraso'
                        ? 'Atraso'
                        : a.tipo === 'interrumpida'
                          ? 'Interrumpida'
                          : 'Sin salida'}
                </span>
                <span>{a.texto}</span>
                {a.ejecucionId && a.tipo !== 'ticket' && (
                  <button
                    type="button"
                    className="pr-link-button"
                    onClick={() => setDetail(a.ejecucionId!)}
                  >
                    Ver ruta
                  </button>
                )}
                {a.tipo === 'ticket' && (
                  <button type="button" className="pr-link-button" onClick={() => onGo('pesaje')}>
                    Registrar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.avisos.length > 0 && (
        <ul className="op-avisos-dia">
          {data.avisos.map((a) => (
            <li key={a.id} className={a.tipo === 'suspension' ? 'is-warn' : ''}>
              <CalendarClock size={15} aria-hidden="true" />
              <span>
                <strong>{AVISO_TIPO[a.tipo]}:</strong> {a.titulo}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="op-dia">
        <ul className="op-rutas" aria-label="Rutas del día">
          {rutas.map((r) => {
            const s = SITUACION[r.situacion];
            const delay = r.ultimoAtraso ?? r.atrasoSalida;
            return (
              <li
                key={r.id}
                className={`op-ruta ${selected === r.id ? 'is-activa' : ''}`}
                style={{ borderLeftColor: r.color }}
              >
                <button type="button" className="op-ruta-cabeza" onClick={() => select(r.id)}>
                  <span className="op-ruta-nombre">
                    <strong>{shortName(r.nombre)}</strong>
                    <span>
                      {r.horaInicio}–{r.horaFin} · {r.vehiculo}
                    </span>
                  </span>
                  <span className={`op-situacion ${s.tono}`}>{s.texto}</span>
                </button>
                {r.ejecucionId ? (
                  <div className="op-ruta-cuerpo">
                    <div className="op-avance" aria-label={`${r.pasados} de ${r.puntos} puntos`}>
                      <span style={{ width: `${pct(r.pasados, r.puntos)}%` }} />
                    </div>
                    <p>
                      <Truck size={13} aria-hidden="true" /> Salió{' '}
                      {r.salida ? limaTime(r.salida) : '—'}
                      {r.atrasoSalida !== null && (
                        <em className={`op-delay ${delayTone(r.atrasoSalida)}`}>
                          {' '}
                          {delayText(r.atrasoSalida)}
                        </em>
                      )}
                      {r.ultimoPunto && (
                        <>
                          {' '}
                          · último punto <strong>{r.ultimoPunto}</strong> a las{' '}
                          {limaTime(r.ultimoMomento!)}
                          {delay !== null && (
                            <em className={`op-delay ${delayTone(delay)}`}>
                              {' '}
                              ({delayText(delay)})
                            </em>
                          )}
                        </>
                      )}
                    </p>
                    <p>
                      {r.pasados} de {r.puntos} puntos registrados
                      {r.llegada ? ` · llegó ${limaTime(r.llegada)}` : ''}
                      {r.llegadas > 0 &&
                        r.servicio !== 'organicos' &&
                        r.servicio !== 'reciclables' && (
                          <>
                            {' '}
                            · <Scale size={12} aria-hidden="true" />{' '}
                            {r.tickets
                              ? `${kgText(r.netoKg)} en ${r.tickets} ticket(s)`
                              : 'ticket por registrar'}
                          </>
                        )}
                    </p>
                    {r.motivoInterrupcion && <p className="op-motivo">{r.motivoInterrupcion}</p>}
                    <button
                      type="button"
                      className="pr-link-button"
                      onClick={() => setDetail(r.ejecucionId)}
                    >
                      Ver recorrido
                    </button>
                  </div>
                ) : (
                  <p className="op-ruta-cuerpo op-muted">
                    {r.situacion === 'pendiente' || r.situacion === 'por_iniciar'
                      ? `Sale a las ${r.horaInicio}${r.sectores.length ? ` · ${r.sectores.join(', ')}` : ''}`
                      : r.situacion === 'suspendida'
                        ? 'Suspendida por aviso.'
                        : 'Sin salida registrada.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <OperacionMapa rutas={rutas} selected={selected} onSelect={select} />
      </div>

      <section className="op-semana" aria-labelledby="op-semana-t">
        <div className="pr-section-head">
          <div>
            <h3 id="op-semana-t">Últimos 7 días</h3>
            <p>
              {pct(totalComp, totalProg)} % de las rutas programadas terminadas ({totalComp} de{' '}
              {totalProg}) · {pct(totalPunt, totalPasos)} % de los pasos a tiempo (±15 min) ·{' '}
              {kgText(semana.reduce((n, d) => n + d.kg, 0))} pesadas en el relleno
            </p>
          </div>
          <button type="button" className="pr-link-button" onClick={() => onGo('cumplimiento')}>
            Cumplimiento por ruta
          </button>
        </div>
        <div className="op-barras">
          {semana.map((d) => {
            const day = new Date(`${d.fecha}T12:00:00Z`).getUTCDay();
            return (
              <button
                key={d.fecha}
                type="button"
                className={`op-barra ${d.fecha === fecha ? 'is-activa' : ''}`}
                onClick={() => setFecha(d.fecha)}
                title={`${showDay(d.fecha)}: ${d.completadas} de ${d.programadas} rutas, ${kgText(d.kg)}`}
              >
                <span className="op-barra-kg" style={{ height: `${(100 * d.kg) / maxKg}%` }} />
                <span className="op-barra-dato">
                  {d.programadas ? `${d.completadas}/${d.programadas}` : '—'}
                </span>
                <span className="op-barra-dia">
                  {WEEKDAY[day]} {Number(d.fecha.slice(8))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <EjecucionSheet id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
