import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management, type Detail, type Predio, type User } from '@/features/gestion/api';
import { Audit } from '@/features/gestion/audit';
import { Catalogs } from '@/features/gestion/catalogs';
import { Imports, Reports } from '@/features/gestion/gestion-page';
import { ServiceOperation } from '@/features/gestion/service-operation';
import { PasswordChange, Users } from '@/features/gestion/users';
import { ActivityComposer } from '@/features/bagua-master/components/activity-composer';
import '@/features/gestion/gestion.css';
import { SessionGate } from './session';
import { ResultadosOperacion } from './resultados-operacion';
import { CierreMes } from '@/features/cierre/cierre';
import '@/features/operacion/supervisor.css';
import { useEnvironment } from './use-session';

function Space({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="pr-page pr-embed">
      <div className="pr-container">
        <header className="pr-page-head">
          <div>
            <p className="pr-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{lead}</p>
          </div>
        </header>
        <div className="gm-workspace">{children}</div>
      </div>
    </div>
  );
}

// Registro corto de una entrega: se elige el predio una sola vez y el formulario hereda su
// contexto. Pensado para el celular: un campo de búsqueda, una lista y un formulario breve.
function QuickDelivery() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const results = useQuery({
    queryKey: ['gestion', 'entrega-rapida', term],
    queryFn: ({ signal }) =>
      management<{ items: Predio[] }>(
        `/predios?${new URLSearchParams({ q: term, archivo: 'activos' })}`,
        'GET',
        undefined,
        signal,
      ),
    enabled: term.length >= 2 && !picked,
  });
  const detail = useQuery({
    queryKey: ['gestion', 'predio', picked],
    queryFn: ({ signal }) => management<Detail>(`/predios/${picked}`, 'GET', undefined, signal),
    enabled: !!picked,
  });
  function reset() {
    setPicked('');
    setSearch('');
    setTerm('');
    if (params.has('registrar'))
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete('registrar');
          return next;
        },
        { replace: true },
      );
  }
  return (
    <section className="pr-card pr-card-pad" aria-labelledby="h-quick">
      <div className="pr-section-head">
        <div>
          <h2 id="h-quick">Registrar una entrega</h2>
          <p>Busca el predio y completa fecha y material. Queda con tu nombre y su historial.</p>
        </div>
      </div>
      {saved && (
        <p className="pr-notice is-info" role="status" style={{ marginBottom: 14 }}>
          {saved}
        </p>
      )}
      {!picked ? (
        <>
          <label
            className="pr-field"
            style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 460 }}
          >
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              autoFocus={params.has('registrar')}
              aria-label="Buscar el predio de la entrega"
              placeholder="Código o dirección del predio"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: 'transparent',
                font: 'inherit',
                color: 'inherit',
                minWidth: 0,
              }}
            />
          </label>
          {term.length >= 2 && (
            <div className="pr-card" style={{ marginTop: 12 }}>
              {results.isPending ? (
                <div className="pr-empty" role="status">
                  Buscando…
                </div>
              ) : results.isError ? (
                <div className="pr-empty" role="alert">
                  No se pudo buscar.{' '}
                  <button
                    type="button"
                    className="pr-link-button"
                    onClick={() => void results.refetch()}
                  >
                    Reintentar
                  </button>
                </div>
              ) : !results.data.items.length ? (
                <div className="pr-empty">
                  <strong>Sin coincidencias</strong>
                  Prueba con el código completo o parte de la dirección.
                </div>
              ) : (
                <ul className="pr-list">
                  {results.data.items.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <div className="pr-list-main">
                        <strong>
                          <span className="pr-mono">{p.codigo}</span> · {p.direccion}
                        </strong>
                        <span>{p.sector || 'Sector sin información'}</span>
                      </div>
                      <Button size="sm" onClick={() => setPicked(p.id)}>
                        Elegir
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : detail.isPending ? (
        <div
          className="pr-skeleton"
          style={{ height: 160 }}
          role="status"
          aria-label="Cargando predio"
        />
      ) : detail.isError ? (
        <p className="pr-error" role="alert">
          No se pudo abrir el predio.{' '}
          <button type="button" className="pr-link-button" onClick={reset}>
            Elegir otro
          </button>
        </p>
      ) : (
        <div style={{ maxWidth: 560 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>
            Predio{' '}
            <Link
              className="pr-link pr-mono"
              to={`/bagua-master/expedientes/predio/${detail.data.predio.id}`}
            >
              {detail.data.predio.codigo}
            </Link>{' '}
            ·{' '}
            <button type="button" className="pr-link-button" onClick={reset}>
              cambiar
            </button>
          </p>
          <ActivityComposer
            key={picked}
            data={detail.data}
            onClose={reset}
            onSaved={() => {
              setSaved(`Entrega guardada en ${detail.data.predio.codigo}.`);
              reset();
            }}
          />
        </div>
      )}
    </section>
  );
}

export function ServiciosPage() {
  return (
    <SessionGate>
      {(user) => (
        <Space
          eyebrow="Servicios y actividades"
          title="Gestión de servicios"
          lead="Consulta quién tiene asignado o participa en cada servicio y registra las entregas. Asignación, participación y entrega son registros distintos."
        >
          <div style={{ display: 'grid', gap: 20 }}>
            {user.rol !== 'consulta' && <QuickDelivery />}
            <section className="pr-card pr-card-pad" aria-labelledby="h-op">
              <ServiceOperation user={user} />
            </section>
          </div>
        </Space>
      )}
    </SessionGate>
  );
}

export function ResultadosPage() {
  return <SessionGate>{(user: User) => <Resultados user={user} />}</SessionGate>;
}

function Resultados({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const view = params.get('vista') === 'cierre' ? 'cierre' : 'programas';
  return (
    <Space
      eyebrow="Resultados"
      title="Análisis de resultados"
      lead="Participación en los programas selectivos, toneladas recolectadas y pesadas, valorización y padrón. Cada cifra sale de registros que puedes abrir; lo que falta registrar no se estima. El cierre del mes congela las cifras y genera los reportes oficiales."
    >
      <div className="pr-toolbar">
        <div className="pr-segmented" role="group" aria-label="Secciones de resultados">
          <button
            type="button"
            aria-pressed={view === 'programas'}
            onClick={() => setParams({ vista: 'programas' })}
          >
            Programas selectivos
          </button>
          <button
            type="button"
            aria-pressed={view === 'cierre'}
            onClick={() => setParams({ vista: 'cierre' })}
          >
            Cierre del mes y reportes
          </button>
        </div>
      </div>
      {view === 'cierre' ? (
        <section className="pr-card pr-card-pad">
          <CierreMes user={user} />
        </section>
      ) : (
        <>
          <section className="pr-card pr-card-pad">
            <ResultadosOperacion user={user} />
          </section>
          <section className="pr-card pr-card-pad" style={{ marginTop: 20 }}>
            <Reports user={user} />
          </section>
        </>
      )}
    </Space>
  );
}

const adminViews = [
  { id: 'usuarios', label: 'Cuentas', admin: true },
  { id: 'catalogos', label: 'Catálogos', admin: true },
  { id: 'importaciones', label: 'Importaciones', admin: true },
  { id: 'auditoria', label: 'Auditoría', admin: true },
  { id: 'password', label: 'Mi contraseña', admin: false },
] as const;

export function AdministracionPage() {
  return <SessionGate>{(user) => <Administration user={user} />}</SessionGate>;
}

function Administration({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const admin = user.rol === 'administrador';
  const open = !!useEnvironment(true).data?.accesoLibre;
  const views = adminViews.filter(
    (view) => (admin || !view.admin) && !(open && view.id === 'password'),
  );
  const current = views.find((view) => view.id === params.get('vista')) ?? views[0]!;
  return (
    <Space
      eyebrow="Administración"
      title="Administración del sistema"
      lead="Cuentas, catálogos, importaciones, auditoría y acceso. Solo administración modifica estos registros."
    >
      <div className="pr-toolbar">
        <div className="pr-segmented" role="group" aria-label="Secciones de administración">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              aria-pressed={current.id === view.id}
              onClick={() => setParams({ vista: view.id })}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
      <section className="pr-card pr-card-pad">
        {current.id === 'usuarios' ? (
          <Users />
        ) : current.id === 'catalogos' ? (
          <Catalogs />
        ) : current.id === 'importaciones' ? (
          <Imports />
        ) : current.id === 'auditoria' ? (
          <Audit />
        ) : (
          <PasswordChange />
        )}
      </section>
    </Space>
  );
}
