import type { ServiceAtPoint } from '../types';
import { SERVICE_COLOR, SERVICE_LABEL, formatDays, nextPass } from './service-format';
import './service-schedule.css';

// Horario de recolección en un punto: qué servicio pasa, qué días y a qué hora aproximada.
// Lo usan la ficha del mapa y el expediente del predio.

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
  // Una fila por servicio y día de paso; si dos rutas cubren lo mismo se muestran ambas.
  return (
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
                {s.horaEstimada ? (
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
                  {s.base === 'plano' ? ' · hora tomada del plano de rutas' : ''}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
