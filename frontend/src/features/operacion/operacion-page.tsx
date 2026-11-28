import { useSearchParams } from 'react-router-dom';
import type { User } from '@/features/gestion/api';
import { SessionGate } from '@/features/product/session';
import { Tablero } from './tablero';
import { CumplimientoRutas } from './ejecucion';
import { Pesaje } from './pesaje';
import { Avisos } from './avisos';
import { Programacion } from './programacion';
import './operacion.css';
import './supervisor.css';

// Espacio de Operación: lo que el supervisor y el técnico miran cada día. El tablero del día, el
// cumplimiento de cada ruta, el pesaje en la oficina, los avisos al vecino y la programación.

const VIEWS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'cumplimiento', label: 'Cumplimiento' },
  { id: 'pesaje', label: 'Pesaje' },
  { id: 'avisos', label: 'Avisos' },
  { id: 'programacion', label: 'Programación' },
] as const;

export function OperacionPage() {
  return <SessionGate>{(user) => <Operacion user={user} />}</SessionGate>;
}

function Operacion({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const current = VIEWS.find((v) => v.id === params.get('vista')) ?? VIEWS[0];
  const go = (vista: string) => setParams({ vista }, { replace: false });
  return (
    <div className="pr-page pr-embed">
      <div className="pr-container">
        <header className="pr-page-head">
          <div>
            <p className="pr-eyebrow">Operación del servicio</p>
            <h1>Operación</h1>
            <p>
              Qué rutas salieron, cuáles van atrasadas, qué falta pesar y qué se avisó al vecino.
              Todo sale de lo que registran el chofer desde su celular y la oficina.
            </p>
          </div>
        </header>
        <div className="pr-toolbar">
          <div className="pr-segmented" role="group" aria-label="Secciones de operación">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={current.id === v.id}
                onClick={() => go(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <section className="pr-card pr-card-pad">
          {current.id === 'hoy' ? (
            <Tablero onGo={go} />
          ) : current.id === 'cumplimiento' ? (
            <CumplimientoRutas />
          ) : current.id === 'pesaje' ? (
            <Pesaje user={user} />
          ) : current.id === 'avisos' ? (
            <Avisos user={user} />
          ) : (
            <Programacion user={user} />
          )}
        </section>
      </div>
    </div>
  );
}
