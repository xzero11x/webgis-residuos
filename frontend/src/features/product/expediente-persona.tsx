import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { management, showDay } from '@/features/gestion/api';
import { SessionGate } from './session';

interface PersonDossier {
  persona: {
    id: string;
    codigo: string;
    nombre: string;
    tipo: string;
    fuente: string;
    sintetica: boolean;
    documento: string | null;
  };
  vinculos: {
    id: string;
    tipo: string;
    desde: string;
    hasta: string | null;
    evidencia: string;
    predio_id: string;
    codigo: string;
    direccion: string;
    sector: string | null;
    estado_ubicacion: string;
    archivado: boolean;
  }[];
  unidades: {
    id: string;
    tipo: string;
    desde: string;
    hasta: string | null;
    unidad_id: string;
    unidad_codigo: string;
    unidad_nombre: string;
    unidad_activa: boolean;
    predio_id: string;
    codigo: string;
    direccion: string;
    archivado: boolean;
  }[];
  masUnidades: boolean;
}

const kind = (value: string) => value.replace(/_/g, ' ');
const when = (from: string, to: string | null) =>
  `${showDay(from)} ${to ? `– ${showDay(to)}` : '· sin fecha de cierre'}`;
const located = (state: string) =>
  state === 'verificada' || state === 'aproximada'
    ? { label: `Ubicación ${state}`, tone: state === 'verificada' ? ' is-info' : ' is-warn' }
    : { label: 'Sin ubicación', tone: '' };

export function ExpedientePersonaPage() {
  const { id = '' } = useParams();
  return (
    <SessionGate roles={['administrador', 'registro']}>{() => <Person id={id} />}</SessionGate>
  );
}

// El expediente de una persona muestra primero sus relaciones reales con predios y unidades.
// Quien consulta elige cuál abrir; nunca se salta a un único predio cuando hay varios.
function Person({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['gestion', 'persona-vinculos', id],
    queryFn: ({ signal }) =>
      management<PersonDossier>(`/personas/${id}/predios`, 'GET', undefined, signal),
    retry: false,
  });
  if (query.isPending)
    return (
      <div className="pr-page">
        <div className="pr-container" role="status" aria-label="Cargando persona">
          <div className="pr-skeleton" style={{ height: 160 }} />
        </div>
      </div>
    );
  if (query.isError)
    return (
      <div className="pr-page">
        <div className="pr-container" role="alert">
          <div className="pr-card pr-empty">
            <strong>
              {query.error instanceof ApiError && query.error.status === 404
                ? 'No se encontró a la persona'
                : 'No se pudo consultar la persona'}
            </strong>
            Revisa tu sesión y permisos, o vuelve a buscarla.
            <div style={{ marginTop: 10 }}>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  const { persona, vinculos, unidades } = query.data;
  const predios = new Set([
    ...vinculos.map((v) => v.predio_id),
    ...unidades.map((u) => u.predio_id),
  ]);
  return (
    <div className="pr-page">
      <div className="pr-container">
        <nav className="pr-breadcrumb" aria-label="Ruta de navegación">
          <Link to="/bagua-master/expedientes?vista=personas">Personas</Link>
          <span aria-hidden="true">/</span>
          <span>{persona.nombre}</span>
        </nav>
        <section className="pr-card pr-dossier-id" aria-labelledby="person-title">
          <div>
            <p className="pr-eyebrow">Expediente de persona</p>
            <h1 id="person-title">{persona.nombre}</h1>
            <p>
              {persona.tipo === 'juridica' ? 'Persona jurídica' : 'Persona natural'} ·{' '}
              <span className="pr-mono">{persona.codigo}</span>
              {persona.documento ? ` · Documento ${persona.documento}` : ''}
            </p>
            <div className="pr-chips" style={{ marginTop: 14 }}>
              {persona.sintetica && <span className="pr-chip is-violet">Persona ficticia</span>}
              <span className="pr-chip">{persona.fuente}</span>
            </div>
          </div>
          <div
            className="pr-stats"
            style={{ margin: 0, gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}
          >
            <div className="pr-stat">
              <span className="pr-stat-value">{predios.size}</span>
              <span className="pr-stat-label">Predios relacionados</span>
            </div>
            <div className="pr-stat">
              <span className="pr-stat-value">{vinculos.length}</span>
              <span className="pr-stat-label">Vínculos con predios</span>
            </div>
            <div className="pr-stat">
              <span className="pr-stat-value">{unidades.length}</span>
              <span className="pr-stat-label">Relaciones de unidad</span>
            </div>
          </div>
        </section>
        <p className="pr-notice" style={{ marginTop: 16 }}>
          El tipo de vínculo es una declaración del registro; no acredita propiedad legal ni
          participación en un servicio.
        </p>

        <section className="pr-section" aria-labelledby="h-vinculos">
          <div className="pr-section-head">
            <div>
              <h2 id="h-vinculos">Predios relacionados</h2>
              <p>Elige cuál consultar: el expediente completo o su ubicación en el mapa.</p>
            </div>
          </div>
          <div className="pr-card">
            {!vinculos.length ? (
              <div className="pr-empty">
                <strong>Sin vínculos a nivel de predio</strong>
              </div>
            ) : (
              <ul className="pr-list">
                {vinculos.map((link) => {
                  const state = located(link.estado_ubicacion);
                  return (
                    <li key={link.id}>
                      <div className="pr-list-main">
                        <strong>
                          <span className="pr-mono">{link.codigo}</span> · {link.direccion}
                        </strong>
                        <span>
                          {kind(link.tipo)} · {when(link.desde, link.hasta)}
                          {link.archivado ? ' · archivado' : ''}
                        </span>
                      </div>
                      <span className={`pr-chip${state.tone}`}>{state.label}</span>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/bagua-master/expedientes/predio/${link.predio_id}`}>
                          Expediente
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/bagua-master?predio=${link.predio_id}`}>Mapa</Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="pr-section" aria-labelledby="h-unidades">
          <div className="pr-section-head">
            <div>
              <h2 id="h-unidades">Unidades y secciones</h2>
              <p>Relaciones propias de la unidad; no se deducen de los vínculos del predio.</p>
            </div>
          </div>
          <div className="pr-card">
            {!unidades.length ? (
              <div className="pr-empty">
                <strong>Sin relaciones de unidad registradas</strong>
              </div>
            ) : (
              <ul className="pr-list">
                {unidades.map((link) => (
                  <li key={link.id}>
                    <div className="pr-list-main">
                      <strong>
                        <span className="pr-mono">{link.unidad_codigo}</span> · {link.unidad_nombre}
                      </strong>
                      <span>
                        {kind(link.tipo)} · predio {link.codigo} · {when(link.desde, link.hasta)}
                      </span>
                    </div>
                    {!link.unidad_activa && <span className="pr-chip is-warn">Inactiva</span>}
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to={`/bagua-master/expedientes/predio/${link.predio_id}?unidad=${link.unidad_id}`}
                      >
                        Expediente
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {query.data.masUnidades && (
            <p className="pr-muted" style={{ fontSize: 13, marginTop: 8 }}>
              Hay más relaciones de unidad que las 100 mostradas.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
