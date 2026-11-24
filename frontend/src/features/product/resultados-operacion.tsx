import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { env } from '@/config/env';
import { management, showDay, type User } from '@/features/gestion/api';

// Resultados de la operación: participación en los programas selectivos, kilos recolectados,
// valorización por actor y padrón oficial. Cada cifra abre las visitas que la sustentan.

interface ServiceRow {
  codigo: string;
  nombre: string;
  inscritos: number;
  visitas: number;
  conEntrega: number;
  ausentes: number;
  porQr: number;
  hogaresConEntrega: number;
  kg: number;
}
interface Data {
  periodo: { desde: string; hasta: string };
  servicios: ServiceRow[];
  meses: { mes: string; codigo: string; visitas: number; conEntrega: number; kg: number }[];
  sectores: {
    sector: string;
    codigo: string;
    participantes: number;
    visitas: number;
    conEntrega: number;
  }[];
  materiales: { material: string; entregas: number; medidas: number; kg: number }[];
  valorizacion: {
    actor: string;
    tipo: string;
    material: string;
    toneladas: number;
    comprobantes: number;
  }[];
  valorizacionMeses: { mes: string; inorganicos: number | null; organicos: number | null }[];
}
interface Drill {
  servicio: string;
  titulo: string;
  sector?: string;
  resultado?: 'entrego' | 'no_entrego' | 'ausente';
  desde: string;
  hasta: string;
}

const COLOR: Record<string, string> = { 'SIM-ORGANICOS': '#16a34a', 'SIM-RECICLABLES': '#2563eb' };
const SHORT: Record<string, string> = {
  'SIM-ORGANICOS': 'Orgánicos',
  'SIM-RECICLABLES': 'Reciclables',
};
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const tons = (kg: number) =>
  `${(kg / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} t`;
const MONTH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym: string) => `${MONTH[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;

export function ResultadosOperacion({ user }: { user: User }) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const query = useQuery({
    queryKey: ['gestion', 'resultados-operacion'],
    queryFn: ({ signal }) => management<Data>('/resultados/operacion', 'GET', undefined, signal),
    retry: false,
  });
  const data = query.data;
  if (query.isPending) return <p role="status">Calculando resultados de la operación…</p>;
  if (query.isError || !data) return <p role="alert">No se pudieron calcular los resultados.</p>;
  const months = [...new Set(data.meses.map((m) => m.mes))];
  const maxKg = Math.max(1, ...data.meses.map((m) => m.kg));
  const sectors = [...new Set(data.sectores.map((s) => s.sector))]
    .map((name) => ({
      name,
      rows: data.sectores.filter((s) => s.sector === name),
    }))
    .sort(
      (a, b) =>
        b.rows.reduce((n, r) => n + r.participantes, 0) -
        a.rows.reduce((n, r) => n + r.participantes, 0),
    );
  const totalVal = data.valorizacion.reduce((n, v) => n + v.toneladas, 0);
  const open = (d: Omit<Drill, 'desde' | 'hasta'>) => setDrill({ ...d, ...data.periodo });

  return (
    <div className="ro" data-testid="resultados-operacion">
      <p className="ro-periodo">
        Del {showDay(data.periodo.desde)} al {showDay(data.periodo.hasta)} · datos de demostración
        simulados
      </p>
      <div className="ro-kpis">
        {data.servicios.map((s) => (
          <article key={s.codigo} className="ro-kpi" style={{ borderTopColor: COLOR[s.codigo] }}>
            <h3>{s.nombre}</h3>
            <button
              type="button"
              onClick={() =>
                open({
                  servicio: s.codigo,
                  titulo: `${s.nombre} · visitas con entrega`,
                  resultado: 'entrego',
                })
              }
            >
              <strong>{pct(s.conEntrega, s.visitas)} %</strong>
              <span>
                de las visitas con entrega ({s.conEntrega.toLocaleString('es-PE')} de{' '}
                {s.visitas.toLocaleString('es-PE')})
              </span>
            </button>
            <div className="ro-kpi-grid">
              <div>
                <strong>{s.inscritos}</strong>
                <span>inscritos activos</span>
              </div>
              <div>
                <strong>{s.hogaresConEntrega}</strong>
                <span>entregaron al menos una vez</span>
              </div>
              <div>
                <strong>{tons(s.kg)}</strong>
                <span>recolectadas y pesadas</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  open({
                    servicio: s.codigo,
                    titulo: `${s.nombre} · ausentes`,
                    resultado: 'ausente',
                  })
                }
              >
                <strong>{pct(s.ausentes, s.visitas)} %</strong>
                <span>visitas sin nadie en casa</span>
              </button>
              <div>
                <strong>{pct(s.porQr, s.visitas)} %</strong>
                <span>visitas registradas con el sticker QR</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="ro-bloque" aria-labelledby="h-ro-meses">
        <h3 id="h-ro-meses">Kilos recolectados por mes</h3>
        <div className="ro-barras" role="img" aria-label="Kilos recolectados por mes y programa">
          {months.map((m) => (
            <div key={m} className="ro-mes">
              <div className="ro-mes-barras">
                {data.meses
                  .filter((r) => r.mes === m)
                  .map((r) => (
                    <span
                      key={r.codigo}
                      title={`${SHORT[r.codigo] ?? r.codigo} · ${monthLabel(m)}: ${Math.round(r.kg).toLocaleString('es-PE')} kg · ${pct(r.conEntrega, r.visitas)} % de entrega`}
                      style={{
                        height: `${(100 * r.kg) / maxKg}%`,
                        background: COLOR[r.codigo] ?? '#64748b',
                      }}
                    />
                  ))}
              </div>
              <small>{monthLabel(m)}</small>
            </div>
          ))}
        </div>
        <p className="ro-leyenda">
          <i style={{ background: COLOR['SIM-ORGANICOS'] }} /> Orgánicos{' '}
          <i style={{ background: COLOR['SIM-RECICLABLES'] }} /> Reciclables
        </p>
      </section>

      <div className="ro-dos">
        <section className="ro-bloque" aria-labelledby="h-ro-sectores">
          <h3 id="h-ro-sectores">Participación por sector</h3>
          <table className="ro-tabla">
            <thead>
              <tr>
                <th>Sector</th>
                <th>Orgánicos</th>
                <th>Reciclables</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map(({ name, rows }) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {['SIM-ORGANICOS', 'SIM-RECICLABLES'].map((code) => {
                    const r = rows.find((x) => x.codigo === code);
                    if (!r)
                      return (
                        <td key={code} className="ro-vacio">
                          —
                        </td>
                      );
                    const value = pct(r.conEntrega, r.visitas);
                    return (
                      <td key={code}>
                        <button
                          type="button"
                          className="ro-celda"
                          onClick={() =>
                            open({
                              servicio: code,
                              sector: name,
                              titulo: `${SHORT[code]} · ${name}`,
                            })
                          }
                        >
                          <span className="ro-mini">
                            <span style={{ width: `${value}%`, background: COLOR[code] }} />
                          </span>
                          {value} % · {r.participantes}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ro-nota">
            Porcentaje de visitas con entrega · número de participantes visitados.
          </p>
        </section>

        <section className="ro-bloque" aria-labelledby="h-ro-materiales">
          <h3 id="h-ro-materiales">Materiales recolectados</h3>
          <table className="ro-tabla">
            <thead>
              <tr>
                <th>Material</th>
                <th>Entregas</th>
                <th>Kg pesados</th>
              </tr>
            </thead>
            <tbody>
              {data.materiales.map((m) => (
                <tr key={m.material}>
                  <th scope="row">{m.material}</th>
                  <td>{m.entregas.toLocaleString('es-PE')}</td>
                  <td>
                    {Math.round(m.kg).toLocaleString('es-PE')}
                    {m.medidas < m.entregas && (
                      <span className="ro-nota"> · {m.entregas - m.medidas} sin pesar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="ro-sub">
            Valorización por actor ·{' '}
            {totalVal.toLocaleString('es-PE', { maximumFractionDigits: 1 })} t
          </h3>
          <table className="ro-tabla">
            <tbody>
              {data.valorizacion.map((v) => (
                <tr key={`${v.actor}-${v.material}`}>
                  <th scope="row">
                    {v.material}
                    <span className="ro-nota"> · {v.actor}</span>
                  </th>
                  <td>{v.toneladas.toLocaleString('es-PE', { maximumFractionDigits: 2 })} t</td>
                  <td className="ro-nota">{v.comprobantes} comprob.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {user.rol !== 'consulta' && (
        <section className="ro-bloque" aria-labelledby="h-ro-padron">
          <h3 id="h-ro-padron">Padrón de participantes (formato MINAM)</h3>
          <div className="ro-descargas">
            {(
              [
                ['reciclables', 'domiciliario', '03-A · Viviendas · inorgánicos'],
                ['reciclables', 'no_domiciliario', '03-B · No domiciliarios · inorgánicos'],
                ['organicos', 'domiciliario', '03-C · Viviendas · orgánicos'],
                ['organicos', 'no_domiciliario', '03-D · No domiciliarios · orgánicos'],
              ] as const
            ).map(([servicio, tipo, label]) => (
              <a
                key={label}
                className="ro-descarga"
                href={`${env.VITE_API_BASE_URL}/gestion/padron.csv?servicio=${servicio}&tipo=${tipo}`}
                download
              >
                <Download size={14} aria-hidden="true" /> {label}
              </a>
            ))}
          </div>
        </section>
      )}

      {drill && <DrillSheet drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function DrillSheet({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    servicio: drill.servicio,
    desde: drill.desde,
    hasta: drill.hasta,
    page: String(page),
  });
  if (drill.sector) params.set('sector', drill.sector);
  if (drill.resultado) params.set('resultado', drill.resultado);
  const query = useQuery({
    queryKey: ['gestion', 'resultados-visitas', params.toString()],
    queryFn: ({ signal }) =>
      management<{
        items: {
          id: string;
          fecha: string;
          resultado: string;
          predioId: string;
          codigo: string;
          direccion: string;
          sector: string | null;
          codigoPadron: string | null;
          kg: number;
        }[];
        siguiente: boolean;
      }>(`/resultados/visitas?${params}`, 'GET', undefined, signal),
  });
  return (
    <div className="ro-drill" role="dialog" aria-modal="true" aria-label={drill.titulo}>
      <div className="ro-drill-panel">
        <header>
          <h3>{drill.titulo}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="ro-nota">
          Visitas que sustentan la cifra, de la más reciente a la más antigua.
        </p>
        {query.isPending && <p role="status">Cargando…</p>}
        <ul className="ro-drill-lista">
          {query.data?.items.map((v) => (
            <li key={v.id}>
              <span className="ro-nota">{showDay(v.fecha)}</span>
              <Link to={`/bagua-master/expedientes/predio/${v.predioId}`}>{v.direccion}</Link>
              <span className="ro-nota">
                {v.codigoPadron} ·{' '}
                {v.resultado === 'entrego'
                  ? `entregó${v.kg ? ` ${v.kg} kg` : ''}`
                  : v.resultado === 'ausente'
                    ? 'ausente'
                    : 'no entregó'}
              </span>
            </li>
          ))}
        </ul>
        <div className="ro-drill-pie">
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anteriores
          </button>
          <button type="button" disabled={!query.data?.siguiente} onClick={() => setPage(page + 1)}>
            Siguientes
          </button>
        </div>
      </div>
    </div>
  );
}
