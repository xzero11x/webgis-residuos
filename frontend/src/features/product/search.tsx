import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, CornerDownLeft, Home, MapPin, Route, Search, User, X } from 'lucide-react';
import { management } from '@/features/gestion/api';
import { ApiError } from '@/lib/api';
import {
  useBaguaMasterRoutes,
  useBaguaMasterSearch,
} from '@/features/bagua-master/hooks/use-bagua-master';
import { useSession } from './use-session';

interface PredioHit {
  id: string;
  codigo: string;
  direccion: string;
  sector: string | null;
  uso: string | null;
  estado_ubicacion: 'pendiente' | 'aproximada' | 'verificada' | 'conflictiva';
  archivado: boolean;
  sintetica: boolean;
  unidades: number;
}
interface UnitHit {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  predio_id: string;
  predio_codigo: string;
  direccion: string;
}
interface PersonHit {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  sintetica: boolean;
  documento: string | null;
  predios: number;
}
interface SearchResponse {
  q: string;
  predios: PredioHit[];
  unidades: UnitHit[];
  personas: PersonHit[];
  personasPermitidas: boolean;
}

interface Option {
  key: string;
  group: string;
  icon: ReactNode;
  title: ReactNode;
  detail: string;
  chip?: { label: string; tone?: 'info' | 'warn' | 'danger' | 'violet' | 'neutral' };
  open: () => string;
  alt?: { label: string; to: string };
}

const norm = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Mark({ text, term }: { text: string; term: string }) {
  const at = norm(text).indexOf(norm(term));
  if (at < 0 || !term) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

const locationChip = (state: PredioHit['estado_ubicacion']): Option['chip'] =>
  state === 'verificada'
    ? { label: 'Ubicación verificada', tone: 'info' }
    : state === 'aproximada'
      ? { label: 'Ubicación aproximada', tone: 'warn' }
      : state === 'conflictiva'
        ? { label: 'Ubicación en conflicto', tone: 'danger' }
        : { label: 'Sin ubicación', tone: 'neutral' };

// Búsqueda universal: un solo sistema para personas, predios, unidades, rutas, calles y
// lugares. Resultados agrupados, con contexto suficiente para distinguirlos, navegables por
// teclado. Los datos personales solo se consultan con perfil autorizado y se muestran
// reducidos (documento enmascarado, sin direcciones de las personas).
export function UniversalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState({ key: '', index: 0 });
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inExpedientes = location.pathname.startsWith('/bagua-master/expedientes');

  useEffect(() => {
    const timer = setTimeout(() => setTerm(value.trim()), 200);
    return () => clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const typing = /^(input|textarea|select)$/i.test((event.target as HTMLElement)?.tagName);
      if (
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') ||
        (!typing && event.key === '/')
      ) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const ready = term.length >= 2 && term === value.trim();
  const session = useSession();
  const loginNeeded = session.error instanceof ApiError && session.error.status === 401;
  const records = useQuery({
    queryKey: ['gestion', 'busqueda', session.data?.id, term],
    queryFn: ({ signal }) =>
      management<SearchResponse>(
        `/busqueda?${new URLSearchParams({ q: term })}`,
        'GET',
        undefined,
        signal,
      ),
    enabled: open && term.length >= 2 && session.isSuccess,
    retry: false,
    gcTime: 0,
  });
  const places = useBaguaMasterSearch(open && term.length >= 2 ? term : '');
  const routes = useBaguaMasterRoutes(open && term.length >= 2);

  const options = useMemo<Option[]>(() => {
    if (term.length < 2) return [];
    const list: Option[] = [];
    const personal = records.data?.personasPermitidas;
    for (const p of records.data?.personas ?? [])
      list.push({
        key: `persona-${p.id}`,
        group: 'Personas',
        icon: <User size={15} />,
        title: <Mark text={p.nombre} term={term} />,
        detail: [
          p.tipo === 'juridica' ? 'Jurídica' : 'Natural',
          p.documento ? `Doc. ${p.documento}` : null,
          p.predios === 1 ? '1 predio' : `${p.predios} predios`,
        ]
          .filter(Boolean)
          .join(' · '),
        chip: p.sintetica ? { label: 'Ficticia', tone: 'violet' } : undefined,
        open: () => `/bagua-master?persona=${p.id}`,
        alt: { label: 'Expediente', to: `/bagua-master/expedientes/persona/${p.id}` },
      });
    for (const p of records.data?.predios ?? []) {
      const openMap = `/bagua-master?predio=${p.id}`;
      const dossier = `/bagua-master/expedientes/predio/${p.id}`;
      list.push({
        key: `predio-${p.id}`,
        group: 'Predios',
        icon: <Home size={15} />,
        title: (
          <>
            <span className="mono">
              <Mark text={p.codigo} term={term} />
            </span>{' '}
            · <Mark text={p.direccion} term={term} />
          </>
        ),
        detail: [p.sector || 'Sector sin información', p.uso, p.archivado ? 'Archivado' : null]
          .filter(Boolean)
          .join(' · '),
        chip: locationChip(p.estado_ubicacion),
        open: () => (inExpedientes ? dossier : openMap),
        alt: inExpedientes
          ? { label: 'Ver en mapa', to: openMap }
          : { label: 'Expediente', to: dossier },
      });
    }
    for (const u of records.data?.unidades ?? [])
      list.push({
        key: `unidad-${u.id}`,
        group: 'Unidades y secciones',
        icon: <Building2 size={15} />,
        title: (
          <>
            <span className="mono">{u.codigo}</span> · <Mark text={u.nombre} term={term} />
          </>
        ),
        detail: `${u.tipo === 'seccion' ? 'Sección' : 'Unidad'} del predio ${u.predio_codigo} · ${u.direccion}`,
        open: () => `/bagua-master?predio=${u.predio_id}&unidad=${u.id}`,
        alt: { label: 'Expediente', to: `/bagua-master/expedientes/predio/${u.predio_id}` },
      });
    const matchedRoutes = (routes.data?.rutas ?? []).filter((r) =>
      norm(`${r.codigo} ${r.nombre} ${r.sectores.join(' ')}`).includes(norm(term)),
    );
    for (const r of matchedRoutes.slice(0, 4))
      list.push({
        key: `ruta-${r.codigo}`,
        group: 'Rutas documentales',
        icon: <Route size={15} />,
        title: <Mark text={r.nombre} term={term} />,
        detail: `${r.codigo} · trazado DWG · horario y vigencia sin confirmar`,
        chip: {
          label: r.estado === 'georreferenciada' ? 'Georreferenciada' : 'En revisión',
          tone: r.estado === 'georreferenciada' ? 'info' : 'warn',
        },
        open: () => `/bagua-master?explorar=rutas&ruta=${encodeURIComponent(r.codigo)}`,
      });
    for (const item of places.data?.slice(0, 6) ?? [])
      list.push({
        key: `lugar-${item.tabla}-${item.id}`,
        group: 'Calles y lugares',
        icon: <MapPin size={15} />,
        title: <Mark text={item.nombre} term={term} />,
        detail:
          item.tabla === 'lugar'
            ? `${item.tipo?.replace(/_/g, ' ') ?? 'Lugar'} · Overture Maps`
            : 'Calle · Overture Maps',
        open: () =>
          `/bagua-master?${new URLSearchParams({
            lugar: `${item.tabla}:${item.id}`,
            x: String(item.geometria.coordinates[0]),
            y: String(item.geometria.coordinates[1]),
          })}`,
      });
    void personal;
    return list;
  }, [term, records.data, places.data, routes.data, inExpedientes]);

  // La opción activa vuelve a la primera cuando cambia la búsqueda o la lista.
  const cursorKey = `${term}|${options.length}`;
  const active = cursor.key === cursorKey ? cursor.index : 0;
  const setActive = (index: number) => setCursor({ key: cursorKey, index });

  function go(option: Option | undefined, alt = false) {
    if (!option) return;
    const to = alt && option.alt ? option.alt.to : option.open();
    setOpen(false);
    input.current?.blur();
    navigate(to);
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      go(options[active], event.shiftKey);
    }
  }
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const groups = [...new Set(options.map((option) => option.group))];
  const busy = term.length >= 2 && (!ready || records.isFetching || places.isFetching);
  const failed = records.isError || places.isError;
  const none = ready && !busy && !failed && term.length >= 2 && options.length === 0;

  return (
    <div
      className="pr-search"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={onKeyDown}
    >
      <label className="pr-search-field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          id="bm-work-search"
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder="Buscar predio, persona, ruta o lugar…"
          aria-label="Buscar predio, persona, unidad, ruta, calle o lugar"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && options.length ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
        />
        {value ? (
          <button
            type="button"
            className="pr-icon-button"
            style={{ height: 24, minWidth: 24, padding: 0 }}
            aria-label="Borrar búsqueda"
            onClick={() => {
              setValue('');
              setTerm('');
              input.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd className="pr-kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </label>
      {open && (
        <div
          className="pr-search-panel"
          id={listId}
          role="listbox"
          aria-label="Resultados de búsqueda"
        >
          {term.length < 2 ? (
            <div className="pr-search-hint" role="presentation">
              <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                ¿Qué quieres encontrar?
              </strong>
              <ul>
                <li>
                  <Home size={14} /> Predio por código, dirección o sector
                </li>
                {session.data && session.data.rol !== 'consulta' && (
                  <li>
                    <User size={14} /> Persona por nombre o documento
                  </li>
                )}
                <li>
                  <Route size={14} /> Ruta documental o sector
                </li>
                <li>
                  <MapPin size={14} /> Calle o lugar del mapa
                </li>
              </ul>
            </div>
          ) : (
            <>
              {groups.map((group) => (
                <section className="pr-search-group" key={group} role="presentation">
                  <h2>{group}</h2>
                  {options
                    .map((option, index) => ({ option, index }))
                    .filter(({ option }) => option.group === group)
                    .map(({ option, index }) => (
                      <div
                        key={option.key}
                        id={`${listId}-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={active === index}
                        className="pr-search-item"
                        onMouseMove={() => setActive(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => go(option)}
                      >
                        <span className="pr-search-icon" aria-hidden="true">
                          {option.icon}
                        </span>
                        <span className="pr-search-text">
                          <strong>{option.title}</strong>
                          <span>{option.detail}</span>
                        </span>
                        <span className="pr-search-side">
                          {option.chip && (
                            <span
                              className={`pr-chip${option.chip.tone && option.chip.tone !== 'neutral' ? ` is-${option.chip.tone}` : ''}`}
                            >
                              {option.chip.label}
                            </span>
                          )}
                          {option.alt && (
                            <Link
                              to={option.alt.to}
                              tabIndex={-1}
                              className="pr-link"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpen(false);
                              }}
                            >
                              {option.alt.label}
                            </Link>
                          )}
                        </span>
                      </div>
                    ))}
                </section>
              ))}
              {busy && (
                <p className="pr-search-note" role="status">
                  Buscando…
                </p>
              )}
              {none && (
                <p className="pr-search-note" role="status">
                  Sin coincidencias para «{term}». Prueba con el código del predio, un apellido, un
                  documento o el nombre de una calle.
                </p>
              )}
              {failed && (
                <p className="pr-search-note" role="alert">
                  No se pudo completar la búsqueda.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      void records.refetch();
                      void places.refetch();
                    }}
                  >
                    Reintentar
                  </button>
                </p>
              )}
              {loginNeeded && ready && (
                <p className="pr-search-note">
                  Ingresa para buscar predios, unidades y personas.{' '}
                  <Link
                    className="pr-link"
                    to="/bagua-master/expedientes"
                    onClick={() => setOpen(false)}
                  >
                    Ingresar
                  </Link>
                </p>
              )}
              {records.data && !records.data.personasPermitidas && ready && (
                <p className="pr-search-note">
                  Tu perfil consulta predios, no personas. La búsqueda de personas requiere otro
                  perfil.
                </p>
              )}
            </>
          )}
          <div className="pr-search-foot" aria-hidden="true">
            <span>
              <kbd className="pr-kbd">↑</kbd>
              <kbd className="pr-kbd">↓</kbd> navegar
            </span>
            <span>
              <kbd className="pr-kbd">
                <CornerDownLeft size={11} />
              </kbd>{' '}
              abrir
            </span>
            <span>
              <kbd className="pr-kbd">⇧ ⏎</kbd> expediente
            </span>
            <span>
              <kbd className="pr-kbd">esc</kbd> cerrar
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
