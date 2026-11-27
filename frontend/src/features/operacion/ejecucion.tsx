import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { management, showDay } from '@/features/gestion/api';
import { Sheet } from '@/features/product/sheet';
import {
  DESTINO_NOMBRE,
  SERVICIO_NOMBRE,
  SITUACION,
  delayText,
  delayTone,
  kgText,
  limaTime,
  limaToday,
  type Destino,
  type Servicio,
  type Situacion,
  shortName,
} from './tipos';

// Recorrido de una ejecución: cada punto de control con su hora programada y la real, las
// llegadas al destino y los tickets de balanza. Y el cumplimiento de cada ruta en un periodo.

interface Detalle {
  id: string;
  fecha: string;
  nombre: string;
  servicio: Servicio;
  vehiculo: string;
  estado: Situacion;
  motivoInterrupcion: string | null;
  conductor: string;
  horaInicio: string;
  horaFin: string;
  puntos: {
    id: string;
    orden: number;
    nombre: string;
    hora: string;
    base: string;
    momento: string | null;
    atraso: number | null;
    distanciaM: number | null;
  }[];
  eventos: {
    id: string;
    tipo: 'salida' | 'paso' | 'llegada';
    momento: string;
    destino: Destino | null;
    registradoEn: string;
  }[];
  pesajes: {
    id: string;
    ticket: string;
    hora: string | null;
    pesoNetoKg: number;
    pesoBrutoKg: number;
    taraKg: number;
  }[];
}

export function EjecucionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['gestion', 'ejecucion', id],
    queryFn: ({ signal }) =>
      management<Detalle>(`/operacion/ejecuciones/${id}`, 'GET', undefined, signal),
    enabled: !!id,
  });
  const d = query.data;
  const salida = d?.eventos.find((e) => e.tipo === 'salida');
  const late = d?.eventos.filter(
    (e) => new Date(e.registradoEn).getTime() - new Date(e.momento).getTime() > 5 * 60_000,
  ).length;
  return (
    <Sheet
      open={!!id}
      title={d ? shortName(d.nombre) : 'Recorrido'}
      description="Puntos de control con hora programada y real"
      onClose={onClose}
    >
      {query.isPending && <div className="pr-skeleton" style={{ height: 300 }} />}
      {query.isError && <p role="alert">No se pudo abrir el recorrido.</p>}
      {d && (
        <div className="op-detalle">
          <p className="op-detalle-meta">
            {showDay(d.fecha)} · {SERVICIO_NOMBRE[d.servicio]} · {d.vehiculo}
            <br />
            {d.conductor} ·{' '}
            <span className={`op-situacion ${SITUACION[d.estado]?.tono ?? ''}`}>
              {SITUACION[d.estado]?.texto ?? d.estado}
            </span>
          </p>
          {d.motivoInterrupcion && <p className="op-motivo">{d.motivoInterrupcion}</p>}
          <table className="op-tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Punto de control</th>
                <th>Programado</th>
                <th>Real</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {salida && (
                <tr>
                  <td>—</td>
                  <td>Salida</td>
                  <td>{d.horaInicio}</td>
                  <td>{limaTime(salida.momento)}</td>
                  <td />
                </tr>
              )}
              {d.puntos.map((p) => (
                <tr key={p.id} className={p.momento ? '' : 'is-falta'}>
                  <td>{p.orden}</td>
                  <td>
                    {p.nombre}
                    {p.distanciaM !== null && p.distanciaM > 150 && (
                      <small> · marcado a {p.distanciaM} m</small>
                    )}
                  </td>
                  <td>{p.hora}</td>
                  <td>{p.momento ? limaTime(p.momento) : 'sin registro'}</td>
                  <td>
                    {p.atraso !== null && (
                      <span className={`op-delay ${delayTone(p.atraso)}`}>
                        {delayText(p.atraso)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {d.eventos
                .filter((e) => e.tipo === 'llegada')
                .map((e, i) => (
                  <tr key={e.id}>
                    <td>—</td>
                    <td>
                      Llegada al {DESTINO_NOMBRE[e.destino!]}
                      {i > 0 ? ` (viaje ${i + 1})` : ''}
                    </td>
                    <td />
                    <td>{limaTime(e.momento)}</td>
                    <td />
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="op-nota">
            {d.puntos.filter((p) => p.momento).length} de {d.puntos.length} puntos registrados.
            {late ? ` ${late} registro(s) se enviaron después, al volver la señal.` : ''} La hora
            programada sale de los tiempos de paso del plano municipal cuando la ruta los tiene.
          </p>
          {d.pesajes.length > 0 && (
            <>
              <h3 className="op-subtitulo">Tickets de balanza</h3>
              <ul className="pr-list">
                {d.pesajes.map((w) => (
                  <li key={w.id}>
                    <div className="pr-list-main">
                      <strong className="pr-mono">{w.ticket}</strong>
                      <span>
                        {w.hora ?? '—'} · bruto {kgText(w.pesoBrutoKg)} · tara {kgText(w.taraKg)}
                      </span>
                    </div>
                    <strong>{kgText(w.pesoNetoKg)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

interface Cumplimiento {
  desde: string;
  hasta: string;
  programas: {
    id: string;
    nombre: string;
    servicio: Servicio;
    color: string;
    programadas: number;
    ejecutadas: number;
    completadas: number;
    interrumpidas: number;
    pasos: number;
    puntuales: number;
    atrasoMediano: number | null;
    viajes: number;
    kg: number;
  }[];
}
interface Ejecuciones {
  items: {
    id: string;
    fecha: string;
    nombre: string;
    estado: Situacion;
    conductor: string;
    salida: string | null;
    llegada: string | null;
    pasos: number;
    puntos: number;
    atrasoMediano: number | null;
    netoKg: number;
  }[];
  siguiente: boolean;
}
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function CumplimientoRutas() {
  const hoy = limaToday();
  const [dias, setDias] = useState(30);
  const [programa, setPrograma] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const desde = shift(hoy, -(dias - 1));
  const summary = useQuery({
    queryKey: ['gestion', 'cumplimiento', desde, hoy],
    queryFn: ({ signal }) =>
      management<Cumplimiento>(
        `/operacion/cumplimiento?${new URLSearchParams({ desde, hasta: hoy })}`,
        'GET',
        undefined,
        signal,
      ),
  });
  const list = useQuery({
    queryKey: ['gestion', 'ejecuciones', desde, hoy, programa, page],
    queryFn: ({ signal }) =>
      management<Ejecuciones>(
        `/operacion/ejecuciones?${new URLSearchParams({
          desde,
          hasta: hoy,
          page: String(page),
          ...(programa ? { programacion: programa } : {}),
        })}`,
        'GET',
        undefined,
        signal,
      ),
  });
  const rows = summary.data?.programas ?? [];
  const tot = rows.reduce(
    (a, r) => ({
      programadas: a.programadas + r.programadas,
      completadas: a.completadas + r.completadas,
      pasos: a.pasos + r.pasos,
      puntuales: a.puntuales + r.puntuales,
      kg: a.kg + r.kg,
    }),
    { programadas: 0, completadas: 0, pasos: 0, puntuales: 0, kg: 0 },
  );
  return (
    <div className="op-cumplimiento" data-testid="op-cumplimiento">
      <div className="pr-toolbar">
        <div className="pr-segmented" role="group" aria-label="Periodo">
          {[7, 30, 90].map((n) => (
            <button key={n} type="button" aria-pressed={dias === n} onClick={() => setDias(n)}>
              {n} días
            </button>
          ))}
        </div>
      </div>
      {summary.isPending && <div className="pr-skeleton" style={{ height: 240 }} />}
      {summary.data && (
        <>
          <p className="op-nota">
            Del {showDay(summary.data.desde)} al {showDay(summary.data.hasta)}:{' '}
            {pct(tot.completadas, tot.programadas)} % de las rutas programadas terminadas,{' '}
            {pct(tot.puntuales, tot.pasos)} % de los pasos a tiempo y {kgText(tot.kg)} pesadas. Se
            cuentan desde que cada ruta empezó a registrarse y sin los días suspendidos por aviso.
          </p>
          <div className="op-tabla-scroll">
            <table className="op-tabla">
              <thead>
                <tr>
                  <th>Ruta</th>
                  <th>Programadas</th>
                  <th>Terminadas</th>
                  <th>Interrumpidas</th>
                  <th>A tiempo</th>
                  <th>Atraso típico</th>
                  <th>Viajes</th>
                  <th>Toneladas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        type="button"
                        className="op-ruta-link"
                        style={{ borderLeftColor: r.color }}
                        onClick={() => {
                          setPrograma(programa === r.id ? '' : r.id);
                          setPage(1);
                        }}
                        aria-pressed={programa === r.id}
                      >
                        {shortName(r.nombre)}
                      </button>
                    </td>
                    <td>{r.programadas}</td>
                    <td>
                      {r.completadas} <small>({pct(r.completadas, r.programadas)} %)</small>
                    </td>
                    <td>{r.interrumpidas || '—'}</td>
                    <td>{r.pasos ? `${pct(r.puntuales, r.pasos)} %` : '—'}</td>
                    <td>
                      {r.atrasoMediano !== null ? (
                        <span className={`op-delay ${delayTone(r.atrasoMediano)}`}>
                          {delayText(r.atrasoMediano)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{r.viajes || '—'}</td>
                    <td>{r.kg ? kgText(r.kg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h3 className="op-subtitulo">
        Recorridos{' '}
        {programa
          ? `de ${shortName(rows.find((r) => r.id === programa)?.nombre) ?? ''}`
          : 'registrados'}
      </h3>
      {list.data && (
        <>
          <div className="op-tabla-scroll">
            <table className="op-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ruta</th>
                  <th>Estado</th>
                  <th>Salida</th>
                  <th>Llegada</th>
                  <th>Puntos</th>
                  <th>Atraso típico</th>
                  <th>Neto</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <button
                        type="button"
                        className="pr-link-button"
                        onClick={() => setDetail(e.id)}
                      >
                        {showDay(e.fecha)}
                      </button>
                    </td>
                    <td>{shortName(e.nombre)}</td>
                    <td>
                      <span className={`op-situacion ${SITUACION[e.estado]?.tono ?? ''}`}>
                        {SITUACION[e.estado]?.texto ?? e.estado}
                      </span>
                    </td>
                    <td>{e.salida ? limaTime(e.salida) : '—'}</td>
                    <td>{e.llegada ? limaTime(e.llegada) : '—'}</td>
                    <td>
                      {e.pasos}/{e.puntos}
                    </td>
                    <td>
                      {e.atrasoMediano !== null && (
                        <span className={`op-delay ${delayTone(e.atrasoMediano)}`}>
                          {delayText(e.atrasoMediano)}
                        </span>
                      )}
                    </td>
                    <td>{e.netoKg ? kgText(e.netoKg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pr-pagination">
            <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Anteriores
            </button>
            <span>Página {page}</span>
            <button
              type="button"
              disabled={!list.data.siguiente}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguientes
            </button>
          </div>
        </>
      )}
      <EjecucionSheet id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
