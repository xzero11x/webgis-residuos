import type { ServiceAtPoint, ServiceNotice } from '../types';
import { SERVICE_COLOR, SERVICE_LABEL, formatDays, nextPass } from './service-format';
import './service-schedule.css';

// Horario de recolección en un punto: qué servicio pasa, qué días y a qué hora. Cuando hay
// recorridos registrados por el chofer, la hora es la habitual (la real), no solo la programada.
// Encima van los avisos vigentes o próximos (suspensiones, cambios de horario). Lo usan la ficha
// del mapa, el expediente del predio y la página del sticker QR.

const NOTICE_LABEL: Record<ServiceNotice['tipo'], string> = {
  suspension: 'Sin servicio',
  cambio_horario: 'Cambio de horario',
  informativo: 'Aviso',
};
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${iso}T12:00:00Z`));

export function ServiceSchedule({
  services,
  loading,
  compact,
}: {
  services: ServiceAtPoint[] | undefined;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) return <p className="bm-horario-vacio">Consultando el horario…</p>;
  if (!services?.length)
    return (
      <p className="bm-horario-vacio">
        Ninguna ruta programada pasa a menos de 80 m de este punto.
      </p>
    );
  const notices = [
    ...new Map(services.flatMap((s) => s.avisos ?? []).map((n) => [n.id, n])).values(),
  ];
  // Una fila por servicio y día de paso; si dos rutas cubren lo mismo se muestran ambas.
  return (
    <>
      {notices.length > 0 && (
        <ul className="bm-avisos" data-testid="bm-avisos">
          {notices.map((n) => (
            <li key={n.id} className={n.tipo === 'suspension' ? 'is-suspension' : ''}>
              <strong>
                {NOTICE_LABEL[n.tipo]} · {n.titulo}
              </strong>
              {!compact && <span>{n.mensaje}</span>}
              <small>
                {n.desde === n.hasta
                  ? shortDate(n.desde)
                  : `${shortDate(n.desde)} – ${shortDate(n.hasta)}`}
              </small>
            </li>
          ))}
        </ul>
      )}
      <ul className={`bm-horario ${compact ? 'is-compact' : ''}`} data-testid="bm-horario">
        {services.map((s) => {
          const next = nextPass(s.dias, s.horaFin);
          return (
            <li key={s.id}>
              <span
                className="bm-horario-tipo"
                style={{ background: SERVICE_COLOR[s.servicio] }}
                aria-hidden="true"
              />
              <div className="bm-horario-cuerpo">
                <strong>
                  {SERVICE_LABEL[s.servicio]}
                  <span className="bm-horario-ruta">{s.rutaNombre.split(' · ')[0]}</span>
                </strong>
                <span>
                  {formatDays(s.dias)} ·{' '}
                  {s.horaHabitual ? (
                    <>
                      pasa habitualmente a las <b>{s.horaHabitual}</b>
                    </>
                  ) : s.horaEstimada ? (
                    <>
                      pasa aprox. <b>{s.horaEstimada}</b>
                    </>
                  ) : (
                    `${s.horaInicio}–${s.horaFin}`
                  )}
                </span>
                {!compact && (
                  <span className="bm-horario-nota">
                    Ventana {s.horaInicio}–{s.horaFin}
                    {next ? ` · próxima ${next}` : ''}
                    {s.horaHabitual && s.recorridos
                      ? ` · según los últimos ${s.recorridos} recorridos (programado ${s.horaEstimada})`
                      : s.base === 'plano'
                        ? ' · hora tomada del plano de rutas'
                        : ''}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
