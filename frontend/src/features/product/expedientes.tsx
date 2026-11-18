import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management, type Person, type Predio, type User } from '@/features/gestion/api';
import { PredioForm } from '@/features/gestion/predio-form';
import { useWorkspaceEdits } from '@/features/gestion/workspace-edits-context';
import '@/features/gestion/gestion.css';
import { Sheet } from './sheet';
import { SessionGate } from './session';

const locationChip = (state: string) =>
  state === 'verificada'
    ? { label: 'Verificada', tone: ' is-info' }
    : state === 'aproximada'
      ? { label: 'Aproximada', tone: ' is-warn' }
      : state === 'conflictiva'
        ? { label: 'En conflicto', tone: ' is-danger' }
        : { label: 'Pendiente', tone: '' };

export function ExpedientesPage() {
  return (
    <SessionGate>
      {(user) => (
        <div className="pr-page pr-embed">
          <Records user={user} />
        </div>
      )}
    </SessionGate>
  );
}

function Records({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const edits = useWorkspaceEdits();
  const personal = user.rol !== 'consulta';
  const view = params.get('vista') === 'personas' && personal ? 'personas' : 'predios';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [term, setTerm] = useState(search);
  const [status, setStatus] = useState('');
  const [archive, setArchive] = useState('activos');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const predios = useQuery({
    queryKey: ['gestion', 'predios', term, status, page, archive],
    queryFn: ({ signal }) =>
      management<{ items: Predio[]; total: number; page: number; pageSize: number }>(
        `/predios?${new URLSearchParams({ q: term, archivo: archive, page: String(page), ...(status ? { ubicacion: status } : {}) })}`,
        'GET',
        undefined,
        signal,
      ),
    enabled: view === 'predios',
    placeholderData: (previous) => previous,
  });
  const people = useQuery({
    queryKey: ['gestion', 'personas', term],
    queryFn: ({ signal }) =>
      management<{ items: Person[] }>(
        `/personas?${new URLSearchParams({ q: term })}`,
        'GET',
        undefined,
        signal,
      ),
    enabled: view === 'personas',
  });
  const create = useMutation({
    mutationFn: (data: unknown) => management<Predio>('/predios', 'POST', data),
    onSuccess: async (record) => {
      edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
      setCreating(false);
      navigate(`/bagua-master/expedientes/predio/${record.id}`);
    },
  });
  const data = predios.data;
  const setView = (next: 'predios' | 'personas') =>
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      if (next === 'personas') updated.set('vista', 'personas');
      else updated.delete('vista');
      return updated;
    });

  return (
    <div className="pr-container">
      <header className="pr-page-head">
        <div>
          <p className="pr-eyebrow">Expedientes</p>
          <h1>Consulta de expedientes</h1>
          <p>
            Cada predio y cada persona tiene un expediente con sus relaciones, servicios y
            actividad. Los registros sin ubicación también tienen expediente.
          </p>
        </div>
        {personal && view === 'predios' && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo predio
          </Button>
        )}
      </header>

      <div className="pr-toolbar">
        <div className="pr-segmented" role="group" aria-label="Tipo de expediente">
          <button
            type="button"
            aria-pressed={view === 'predios'}
            onClick={() => setView('predios')}
          >
            Predios
          </button>
          {personal && (
            <button
              type="button"
              aria-pressed={view === 'personas'}
              onClick={() => setView('personas')}
            >
              Personas
            </button>
          )}
        </div>
        <label
          className="pr-field"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 240px',
            maxWidth: 380,
          }}
        >
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label={view === 'predios' ? 'Filtrar predios' : 'Filtrar personas'}
            placeholder={view === 'predios' ? 'Código, dirección o sector' : 'Nombre o código'}
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
        {view === 'predios' && (
          <>
            <select
              className="pr-field"
              aria-label="Ubicación"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Toda ubicación</option>
              <option value="pendiente">Pendiente</option>
              <option value="aproximada">Aproximada</option>
              <option value="verificada">Verificada</option>
              <option value="conflictiva">En conflicto</option>
            </select>
            <select
              className="pr-field"
              aria-label="Estado del padrón"
              value={archive}
              onChange={(event) => {
                setArchive(event.target.value);
                setPage(1);
              }}
            >
              <option value="activos">Activos</option>
              <option value="archivados">Archivados</option>
              <option value="todos">Todos</option>
            </select>
          </>
        )}
      </div>

      {view === 'predios' ? (
        predios.isPending ? (
          <div
            className="pr-skeleton"
            style={{ height: 320 }}
            role="status"
            aria-label="Cargando predios"
          />
        ) : predios.isError || !data ? (
          <div className="pr-card pr-empty" role="alert">
            <strong>No se pudo cargar el padrón</strong>
            <div style={{ marginTop: 8 }}>
              <Button variant="outline" onClick={() => void predios.refetch()}>
                Reintentar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="pr-table" role="table" aria-label="Predios">
              <div className="pr-row is-head" role="row">
                <span role="columnheader">Código</span>
                <span role="columnheader">Dirección</span>
                <span role="columnheader">Sector y uso</span>
                <span role="columnheader">Ubicación</span>
              </div>
              {!data.items.length ? (
                <div className="pr-empty" role="row">
                  <strong>Sin coincidencias</strong>
                  Cambia la búsqueda o los filtros.
                </div>
              ) : (
                data.items.map((p) => {
                  const chip = locationChip(p.estado_ubicacion);
                  return (
                    <Link
                      key={p.id}
                      role="row"
                      className="pr-row"
                      to={`/bagua-master/expedientes/predio/${p.id}`}
                    >
                      <span role="cell" className="pr-mono">
                        {p.codigo}
                        {p.archivado && <span className="pr-sub">Archivado</span>}
                      </span>
                      <span role="cell">
                        <strong>{p.direccion}</strong>
                        {p.sintetica && <span className="pr-sub">Registro sintético</span>}
                      </span>
                      <span role="cell">
                        {p.sector || 'Sector sin información'}
                        <span className="pr-sub">{p.uso || 'Uso sin información'}</span>
                      </span>
                      <span role="cell" className={`pr-chip${chip.tone}`}>
                        {chip.label}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
            <div className="pr-pagination">
              <span>
                {data.total.toLocaleString('es-PE')} expedientes · página {page}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((v) => v + 1)}
                >
                  Siguiente
                </Button>
              </span>
            </div>
          </>
        )
      ) : people.isPending ? (
        <div
          className="pr-skeleton"
          style={{ height: 240 }}
          role="status"
          aria-label="Cargando personas"
        />
      ) : people.isError ? (
        <div className="pr-card pr-empty" role="alert">
          <strong>No se pudo consultar personas</strong>
          <div style={{ marginTop: 8 }}>
            <Button variant="outline" onClick={() => void people.refetch()}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : (
        <div className="pr-card">
          {!people.data.items.length ? (
            <div className="pr-empty">
              <strong>Sin personas coincidentes</strong>
            </div>
          ) : (
            <ul className="pr-list">
              {people.data.items.map((person) => (
                <li key={person.id}>
                  <div className="pr-list-main">
                    <strong>
                      <Link
                        className="pr-link"
                        to={`/bagua-master/expedientes/persona/${person.id}`}
                      >
                        {person.nombre}
                      </Link>
                    </strong>
                    <span className="pr-mono">{person.codigo}</span>
                  </div>
                  <span className="pr-chip">
                    {person.tipo === 'juridica' ? 'Jurídica' : 'Natural'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Sheet
        open={creating}
        title="Nuevo predio"
        description="Registra un predio. Podrás vincular personas y servicios desde su expediente."
        onClose={() => edits.run(() => setCreating(false))}
      >
        {create.isError && (
          <p role="alert" className="pr-error" style={{ marginBottom: 12 }}>
            {create.error.message}
          </p>
        )}
        <div data-unsaved-form>
          <PredioForm
            pending={create.isPending}
            onCancel={() => edits.run(() => setCreating(false))}
            onSave={(body) => create.mutate(body)}
          />
        </div>
      </Sheet>
    </div>
  );
}
