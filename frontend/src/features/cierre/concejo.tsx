import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { management } from '@/features/gestion/api';
import { SessionGate } from '@/features/product/session';
import { useEnvironment } from '@/features/product/use-session';
import { shortName } from '@/features/operacion/tipos';
import type { Pendiente, Resumen } from './tipos-cierre';
import './cierre.css';

// Resumen del mes para el concejo municipal: una página, en palabras, con las cifras que importan
// comparadas con el mes anterior. Se imprime o se guarda como PDF desde el navegador.

interface Concejo {
  mes: string;
  nombre: string;
  cerrado: boolean;
  resumen: Resumen;
  anterior: { mes: string; nombre: string; cerrado: boolean; resumen: Resumen };
  pendientes: Pendiente[];
}
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const num = (n: number, d = 1) => n.toLocaleString('es-PE', { maximumFractionDigits: d });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function figures(r: Resumen) {
  const rec = r.recoleccion;
  const valor = r.valorizacion.reduce((n, v) => n + v.toneladas, 0);
  const participantes = r.selectiva.reduce((n, s) => n + s.participantes, 0);
  const inscritos = r.selectiva.reduce((n, s) => n + s.inscritos, 0);
  return {
    toneladas: rec.toneladas,
    rutas: pct(rec.completadas, rec.programadas),
    puntual: pct(rec.puntuales, rec.pasos),
    participantes,
    participacion: pct(participantes, inscritos),
    valor,
  };
}

export function ConcejoPage() {
  return <SessionGate>{() => <Concejo />}</SessionGate>;
}

function Concejo() {
  const { mes = '' } = useParams();
  const environment = useEnvironment(true);
  const query = useQuery({
    queryKey: ['gestion', 'concejo', mes],
    queryFn: ({ signal }) =>
      management<Concejo>(`/periodos/${mes}/concejo`, 'GET', undefined, signal),
  });
  useEffect(() => {
    document.title = `Resumen para el concejo · ${mes}`;
  }, [mes]);
  const d = query.data;
  if (query.isPending) return <p className="cj-cargando">Preparando el resumen…</p>;
  if (query.isError || !d) return <p className="cj-cargando">No se pudo preparar el resumen.</p>;
  const now = figures(d.resumen);
  const before = figures(d.anterior.resumen);
  const rec = d.resumen.recoleccion;
  const org = d.resumen.selectiva.find((s) => s.codigo === 'SIM-ORGANICOS');
  const recic = d.resumen.selectiva.find((s) => s.codigo === 'SIM-RECICLABLES');
  const change = (a: number, b: number, unit: string, digits = 1) => {
    if (!b) return '';
    const diff = a - b;
    if (Math.abs(diff) < 0.05) return 'igual que el mes anterior';
    return `${diff > 0 ? '▲' : '▼'} ${num(Math.abs(diff), digits)}${unit} frente a ${d.anterior.nombre.split(' ')[0]}`;
  };
  const rows: [string, string, string][] = [
    [
      'Residuos recolectados y pesados',
      `${num(now.toneladas)} t`,
      change(now.toneladas, before.toneladas, ' t'),
    ],
    ['Rutas terminadas', `${now.rutas} %`, change(now.rutas, before.rutas, ' puntos', 0)],
    [
      'Pasos a tiempo (±15 min)',
      `${now.puntual} %`,
      change(now.puntual, before.puntual, ' puntos', 0),
    ],
    [
      'Hogares y negocios que segregaron',
      `${now.participantes}`,
      change(now.participantes, before.participantes, '', 0),
    ],
    [
      'Valorizado con comprobante',
      `${num(now.valor, 2)} t`,
      change(now.valor, before.valor, ' t', 2),
    ],
  ];
  return (
    <div className="cj">
      {environment.data?.fixturesPermitidos && (
        <p className="cj-demo">Demostración · datos sintéticos, sin validez municipal</p>
      )}
      <button type="button" className="cj-imprimir" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" /> Imprimir o guardar como PDF
      </button>
      <header className="cj-cabecera">
        <p>Municipalidad Provincial de Bagua · Gerencia de Gestión Ambiental</p>
        <h1>Servicio de limpieza pública: {d.nombre}</h1>
        <p>
          Resumen para el concejo municipal · {d.cerrado ? 'mes cerrado' : 'cifras aún abiertas'}
        </p>
      </header>

      <table className="cj-cifras">
        <tbody>
          {rows.map(([label, value, delta]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value}</td>
              <td>{delta}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h2>Lo que pasó</h2>
        <ul className="cj-texto">
          <li>
            Se recolectaron y pesaron <strong>{num(rec.toneladas)} toneladas</strong> en{' '}
            {rec.tickets} viajes al relleno sanitario, con {rec.vehiculos} vehículos.
          </li>
          <li>
            Salieron <strong>{rec.ejecutadas}</strong> de {rec.programadas} rutas programadas y
            terminaron {rec.completadas}
            {rec.interrumpidas
              ? `; ${rec.interrumpidas} se interrumpieron por averías o lluvia`
              : ''}
            . El {now.puntual} % de los pasos por los puntos de control fue a la hora programada.
          </li>
          {(org || recic) && (
            <li>
              En el programa de segregación entregaron residuos{' '}
              <strong>{now.participantes} hogares y negocios</strong> ({now.participacion} % de los
              inscritos)
              {org ? `: ${num(org.kg / 1000, 2)} t de orgánicos` : ''}
              {recic ? ` y ${num(recic.kg / 1000, 2)} t de reciclables` : ''}.
            </li>
          )}
          <li>
            Se valorizaron <strong>{num(now.valor, 2)} toneladas</strong> con comprobante
            {d.resumen.recicladores.asociaciones
              ? `, con ${d.resumen.recicladores.asociaciones} asociación de recicladores formalizada (${d.resumen.recicladores.socios} socios)`
              : ''}
            .
          </li>
          {d.resumen.avisos > 0 && (
            <li>
              Se publicaron {d.resumen.avisos} avisos al vecino (feriados, mantenimiento, campañas).
            </li>
          )}
        </ul>
      </section>

      {d.pendientes.length > 0 && (
        <section>
          <h2>Lo que hay que atender</h2>
          <ul className="cj-texto">
            {d.pendientes.map((p) => (
              <li key={p.clave}>
                {cap(p.titulo.toLowerCase())}: <strong>{p.cantidad}</strong>.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Recolección por ruta</h2>
        <table className="cj-tabla">
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
                <td>{x.toneladas ? num(x.toneladas) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="cj-pie">
        Fuente: WEBGIS BAGUA · registros del chofer, tickets de balanza del relleno, visitas de
        campo y comprobantes de valorización. Generado el{' '}
        {new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(
          new Date(),
        )}
        .
      </footer>
    </div>
  );
}
