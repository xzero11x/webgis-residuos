import { useQuery } from '@tanstack/react-query';
import { management, showDay } from '@/features/gestion/api';
import { ServiceSchedule } from '@/features/bagua-master/components/service-schedule';
import type { ServiceAtPoint } from '@/features/bagua-master/types';

// Servicio y participación de un predio: cuándo pasa cada recolección por su ubicación y cómo
// participa en los programas selectivos (padrón, tasa de entrega, kilos e historial de visitas).

interface Visit {
  id: string;
  fecha: string;
  resultado: 'entrego' | 'no_entrego' | 'ausente';
  observaciones: string;
  kg: number;
  materiales: string[];
}
interface Participation {
  id: string;
  servicio: string;
  servicioCodigo: string;
  desde: string;
  hasta: string | null;
  tipoGenerador: 'domiciliario' | 'no_domiciliario' | null;
  habitantes: number | null;
  establecimiento: string | null;
  tipoEstablecimiento: string | null;
  codigoPadron: string | null;
  zona: string | null;
  representante: string | null;
  visitas: number;
  entregas: number;
  ultimaVisita: string | null;
  kg: number;
  recientes: Visit[];
}

const RESULT: Record<Visit['resultado'], string> = {
  entrego: 'Entregó',
  no_entrego: 'No entregó',
  ausente: 'Ausente',
};
const kg = (value: number) =>
  `${value.toLocaleString('es-PE', { maximumFractionDigits: value < 10 ? 1 : 0 })} kg`;

export function OperacionPredio({ predioId }: { predioId: string }) {
  const query = useQuery({
    queryKey: ['gestion', 'operacion', predioId],
    queryFn: ({ signal }) =>
      management<{ horarios: ServiceAtPoint[]; participaciones: Participation[] }>(
        `/predios/${predioId}/operacion`,
        'GET',
        undefined,
        signal,
      ),
    retry: false,
  });
  if (query.isError) return null;
  const data = query.data;
  return (
    <div className="pr-operacion" data-testid="pr-operacion">
      <div className="pr-card pr-card-pad">
        <h3 className="pr-mini-title">Horario de recolección en este predio</h3>
        <ServiceSchedule services={data?.horarios} loading={query.isPending} />
      </div>
      {data?.participaciones.map((p) => {
        const rate = p.visitas ? Math.round((100 * p.entregas) / p.visitas) : null;
        const recent = [...p.recientes].reverse();
        return (
          <div
            key={p.id}
            className="pr-card pr-card-pad pr-participa"
            data-testid="pr-participacion"
          >
            <div className="pr-participa-head">
              <div>
                <h3 className="pr-mini-title">{p.servicio}</h3>
                <p className="pr-participa-meta">
                  {p.codigoPadron && <span className="pr-mono">{p.codigoPadron}</span>}
                  {p.tipoGenerador === 'no_domiciliario'
                    ? ` · ${p.establecimiento ?? 'Generador no domiciliario'} (${p.tipoEstablecimiento ?? 'no domiciliario'})`
                    : ` · Vivienda${p.habitantes ? ` · ${p.habitantes} habitantes` : ''}`}
                  {p.representante ? ` · Representante: ${p.representante}` : ''}
                </p>
                <p className="pr-participa-meta">
                  En el padrón desde {showDay(p.desde)}
                  {p.hasta ? ` hasta ${showDay(p.hasta)} (baja)` : ''}
                  {p.zona ? ` · ${p.zona}` : ''}
                </p>
              </div>
              <span className={`pr-chip${p.hasta ? '' : ' is-violet'}`}>
                {p.hasta ? 'De baja' : 'Participa'}
              </span>
            </div>
            <div className="pr-participa-stats">
              <div>
                <strong>{rate === null ? '—' : `${rate} %`}</strong>
                <span>de visitas con entrega</span>
              </div>
              <div>
                <strong>{p.entregas}</strong>
                <span>de {p.visitas} visitas</span>
              </div>
              <div>
                <strong>{kg(p.kg)}</strong>
                <span>entregados y pesados</span>
              </div>
              <div>
                <strong>{p.ultimaVisita ? showDay(p.ultimaVisita) : '—'}</strong>
                <span>última visita</span>
              </div>
            </div>
            {recent.length > 0 && (
              <div
                className="pr-visitas"
                aria-label="Últimas visitas, de la más antigua a la más reciente"
              >
                {recent.map((v) => (
                  <span
                    key={v.id}
                    className={`pr-visita is-${v.resultado}`}
                    title={`${showDay(v.fecha)} · ${RESULT[v.resultado]}${
                      v.resultado === 'entrego'
                        ? ` · ${v.materiales.join(', ')}${v.kg ? ` · ${kg(v.kg)}` : ' · sin pesar'}`
                        : v.observaciones
                          ? ` · ${v.observaciones}`
                          : ''
                    }`}
                  />
                ))}
                <span className="pr-visitas-leyenda">
                  <i className="pr-visita is-entrego" /> entregó{' '}
                  <i className="pr-visita is-no_entrego" /> no entregó{' '}
                  <i className="pr-visita is-ausente" /> ausente
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
