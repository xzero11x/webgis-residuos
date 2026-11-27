import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Download, FileText, Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { env } from '@/config/env';
import { management, type User } from '@/features/gestion/api';
import { kgText, shortName } from '@/features/operacion/tipos';
import type { Pendiente, Resumen } from './tipos-cierre';
import './cierre.css';

// Cierre del mes: lo que falta resolver, las cifras del mes y, al cerrarlo, la foto que ya no
// cambia. De ahí salen el reporte para SIGERSOL (CSV) y el resumen para el concejo (para imprimir).

interface Periodo {
  mes: string;
  cerrado: boolean;
  cerradoEn: string | null;
  cerradoPor: string | null;
  toneladas: number | null;
}
interface Detalle {
  mes: string;
  nombre: string;
  terminado: boolean;
  cierre: { cerradoEn: string; cerradoPor: string; observaciones: string } | null;
  resumen: Resumen;
  pendientes: Pendiente[];
  historial: {
    cerradoEn: string;
    cerradoPor: string;
    reabiertoEn: string | null;
    reabiertoPor: string | null;
    motivo: string | null;
  }[];
}
const MONTH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const monthShort = (mes: string) => `${MONTH[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const stamp = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
const t = (n: number) => `${n.toLocaleString('es-PE', { maximumFractionDigits: 1 })} t`;

export function CierreMes({ user }: { user: User }) {
  const client = useQueryClient();
  const periods = useQuery({
    queryKey: ['gestion', 'periodos'],
    queryFn: ({ signal }) =>
      management<{ items: Periodo[]; mesActual: string }>('/periodos', 'GET', undefined, signal),
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const items = periods.data?.items ?? [];
  const mes =
    chosen ?? items.find((p) => p.mes < (periods.data?.mesActual ?? ''))?.mes ?? items[0]?.mes;
  const detail = useQuery({
    queryKey: ['gestion', 'periodo', mes],
    queryFn: ({ signal }) => management<Detalle>(`/periodos/${mes}`, 'GET', undefined, signal),
    enabled: !!mes,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['gestion', 'periodos'] });
    void client.invalidateQueries({ queryKey: ['gestion', 'periodo', mes] });
  };
  const closedMonths = items
    .filter((p) => p.cerrado)
    .map((p) => p.mes)
    .sort();
  const year = mes?.slice(0, 4);
  return (
    <div className="ci" data-testid="cierre-mes">
      <aside className="ci-meses" aria-label="Meses">
        <ul>
          {items.map((p) => (
            <li key={p.mes}>
              <button type="button" aria-pressed={p.mes === mes} onClick={() => setChosen(p.mes)}>
                <span>{monthShort(p.mes)}</span>
                {p.cerrado ? (
                  <span className="ci-estado is-cerrado">
                    <Lock size={12} aria-hidden="true" /> {t(p.toneladas ?? 0)}
                  </span>
                ) : p.mes === periods.data?.mesActual ? (
                  <span className="ci-estado">en curso</span>
                ) : (
                  <span className="ci-estado is-abierto">abierto</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {year && (
          <a
            className="ci-anual"
            href={`${env.VITE_API_BASE_URL}/gestion/reportes/sigersol.csv?${new URLSearchParams({
              desde: closedMonths.find((m) => m.startsWith(year)) ?? `${year}-01`,
              hasta: closedMonths.filter((m) => m.startsWith(year)).at(-1) ?? mes!,
            })}`}
          >
            <Download size={14} aria-hidden="true" /> SIGERSOL {year} (meses cerrados)
          </a>
        )}
      </aside>
      <div className="ci-detalle">
        {detail.isPending && <div className="pr-skeleton" style={{ height: 360 }} />}
        {detail.isError && <p role="alert">No se pudo cargar el mes.</p>}
        {detail.data && <MonthDetail data={detail.data} user={user} onChanged={refresh} />}
      </div>
    </div>
  );
}

function MonthDetail({
  data,
  user,
  onChanged,
}: {
  data: Detalle;
  user: User;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const close = useMutation({
    mutationFn: () =>
      management(`/periodos/${data.mes}/cerrar`, 'POST', { observaciones: notes.trim() }),
    onSuccess: onChanged,
  });
  const reopen = useMutation({
    mutationFn: () =>
      management(`/periodos/${data.mes}/reabrir`, 'POST', { motivo: reason.trim() }),
    onSuccess: () => {
      setReason('');
      onChanged();
    },
  });
  const r = data.resumen;
  const admin = user.rol === 'administrador';
  const important = data.pendientes.filter((p) => p.nivel === 'importante');
  const rec = r.recoleccion;
  const valorOrg = r.valorizacion
    .filter((v) => v.tipo === 'planta_municipal')
    .reduce((n, v) => n + v.toneladas, 0);
  const valorInorg = r.valorizacion
    .filter((v) => v.tipo !== 'planta_municipal')
    .reduce((n, v) => n + v.toneladas, 0);
  return (
    <>
      <header className="ci-cabecera">
        <div>
          <h2>{data.nombre.charAt(0).toUpperCase() + data.nombre.slice(1)}</h2>
          <p>
            {data.cierre
              ? `Cerrado el ${stamp(data.cierre.cerradoEn)} por ${data.cierre.cerradoPor.split(' · ')[0]}. Las cifras ya no cambian.`
              : data.terminado
                ? 'Mes terminado, aún abierto: las cifras cambian si se registra o corrige algo.'
                : 'Mes en curso: las cifras se actualizan con cada registro.'}
          </p>
          {data.cierre?.observaciones && <p className="ci-obs">«{data.cierre.observaciones}»</p>}
        </div>
        <div className="ci-acciones">
          <Button asChild variant="outline" size="sm">
            <a
              href={`${env.VITE_API_BASE_URL}/gestion/reportes/sigersol.csv?desde=${data.mes}&hasta=${data.mes}`}
            >
              <Download size={14} aria-hidden="true" /> Reporte SIGERSOL
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/bagua-master/concejo/${data.mes}`} target="_blank">
              <FileText size={14} aria-hidden="true" /> Resumen para el concejo
            </Link>
          </Button>
        </div>
      </header>

      <div className="ci-cifras">
        <div>
          <span>Recolectado y pesado</span>
          <strong>{t(rec.toneladas)}</strong>
          <small>{rec.tickets} tickets de balanza</small>
        </div>
        <div>
          <span>Rutas terminadas</span>
          <strong>{pct(rec.completadas, rec.programadas)} %</strong>
          <small>
            {rec.completadas} de {rec.programadas} · {rec.interrumpidas} interrumpidas
          </small>
        </div>
        <div>
          <span>Pasos a tiempo</span>
          <strong>{pct(rec.puntuales, rec.pasos)} %</strong>
          <small>±15 min de lo programado</small>
        </div>
        <div>
          <span>Valorizado</span>
          <strong>{t(valorOrg + valorInorg)}</strong>
          <small>
            {t(valorOrg)} orgánicos · {t(valorInorg)} inorgánicos
          </small>
        </div>
      </div>

      {!data.cierre && (
        <section className="ci-pendientes" aria-labelledby="ci-pend">
          <h3 id="ci-pend">Antes de cerrar</h3>
          <ul>
            {data.pendientes.map((p) => (
              <li key={p.clave} className={`is-${p.nivel}`}>
                {p.nivel === 'ok' ? (
                  <CheckCircle2 size={16} aria-hidden="true" />
                ) : (
                  <CircleAlert size={16} aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {p.titulo}
                    {p.nivel !== 'ok' || p.cantidad ? `: ${p.cantidad}` : ''}
                  </strong>
                  {p.nivel !== 'ok' && <span>{p.accion}</span>}
                  {p.clave === 'sin_peso' && p.nivel === 'ok' && <span>{p.accion}</span>}
                  {p.detalle.length > 0 && (
                    <details>
                      <summary>Ver {p.detalle.length}</summary>
                      <ul>
                        {p.detalle.slice(0, 40).map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ci-rutas">
        <h3 id="ci-rutas" className="ci-sub">
          Recolección por ruta
        </h3>
        <table className="op-tabla">
          <thead>
            <tr>
              <th>Ruta</th>
              <th>Programadas</th>
              <th>Terminadas</th>
              <th>Toneladas</th>
            </tr>
          </thead>
          <tbody>
            {rec.rutas.map((x) => (
              <tr key={x.id}>
                <td>{shortName(x.nombre)}</td>
                <td>{x.programadas}</td>
                <td>{x.completadas}</td>
                <td>{x.toneladas ? t(x.toneladas) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="ci-dos">
        <section aria-labelledby="ci-sel">
          <h3 id="ci-sel" className="ci-sub">
            Programa de segregación
          </h3>
          <table className="op-tabla">
            <thead>
              <tr>
                <th>Programa</th>
                <th>Inscritos</th>
                <th>Entregaron</th>
                <th>Con entrega</th>
                <th>Recolectado</th>
              </tr>
            </thead>
            <tbody>
              {r.selectiva.map((s) => (
                <tr key={s.codigo}>
                  <td>{shortName(s.nombre)}</td>
                  <td>
                    {s.inscritos} <small>({s.domiciliarios} viv.)</small>
                  </td>
                  <td>
                    {s.participantes} <small>({pct(s.participantes, s.inscritos)} %)</small>
                  </td>
                  <td>{pct(s.conEntrega, s.visitas)} % de visitas</td>
                  <td>{kgText(s.kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="ci-val">
          <h3 id="ci-val" className="ci-sub">
            Valorización con comprobante
          </h3>
          {r.valorizacion.length ? (
            <table className="op-tabla">
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Material</th>
                  <th>Toneladas</th>
                </tr>
              </thead>
              <tbody>
                {r.valorizacion.map((v) => (
                  <tr key={`${v.actor}-${v.material}`}>
                    <td>{v.actor}</td>
                    <td>{v.material}</td>
                    <td>
                      {v.toneladas.toLocaleString('es-PE', { maximumFractionDigits: 2 })}{' '}
                      <small>({v.comprobantes})</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="op-nota">Aún no hay comprobantes de este mes.</p>
          )}
        </section>
      </div>

      {admin && data.terminado && !data.cierre && (
        <section className="ci-cerrar" aria-labelledby="ci-cerrar-t">
          <h3 id="ci-cerrar-t">Cerrar {data.nombre}</h3>
          <p>
            Se guarda la foto de estas cifras y nadie podrá registrar ni corregir visitas, rutas,
            tickets ni comprobantes de este mes, salvo que se reabra con motivo.
            {important.length
              ? ' Quedan pendientes importantes: resuélvelos o explica abajo por qué se cierra así.'
              : ''}
          </p>
          <textarea
            className="pr-field"
            rows={2}
            maxLength={1000}
            placeholder={
              important.length
                ? 'Observaciones (obligatorias con pendientes importantes)'
                : 'Observaciones (opcional)'
            }
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          {close.isError && (
            <p role="alert" className="pr-error">
              {close.error instanceof Error ? close.error.message : 'No se pudo cerrar.'}
            </p>
          )}
          <Button
            disabled={close.isPending || (important.length > 0 && notes.trim().length < 10)}
            onClick={() => close.mutate()}
            data-testid="ci-cerrar"
          >
            <Lock size={14} aria-hidden="true" /> Cerrar el mes
          </Button>
        </section>
      )}
      {admin && data.cierre && (
        <section className="ci-cerrar" aria-labelledby="ci-reabrir-t">
          <h3 id="ci-reabrir-t">Reabrir el mes</h3>
          <p>Solo para corregir un error. Queda registrado quién lo reabrió y por qué.</p>
          <input
            className="pr-field"
            placeholder="Motivo de la reapertura"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          {reopen.isError && (
            <p role="alert" className="pr-error">
              {reopen.error instanceof Error ? reopen.error.message : 'No se pudo reabrir.'}
            </p>
          )}
          <Button
            variant="outline"
            disabled={reopen.isPending || reason.trim().length < 5}
            onClick={() => reopen.mutate()}
          >
            <LockOpen size={14} aria-hidden="true" /> Reabrir
          </Button>
        </section>
      )}
      {data.historial.some((h) => h.reabiertoEn) && (
        <details className="op-prog-historial">
          <summary>Historial de cierres</summary>
          <ul>
            {data.historial.map((h) => (
              <li key={h.cerradoEn}>
                Cerrado {stamp(h.cerradoEn)} por {h.cerradoPor.split(' · ')[0]}
                {h.reabiertoEn &&
                  ` · reabierto ${stamp(h.reabiertoEn)} por ${h.reabiertoPor?.split(' · ')[0]}: ${h.motivo}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
