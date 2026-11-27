import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Route, Search, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management } from '@/features/gestion/api';
import { useSession } from './use-session';

interface Day {
  rutas: { situacion: string }[];
  alertas: unknown[];
}

// Estado inicial del mapa: cómo va el servicio hoy (con sesión) y adónde ir, sin tapar el mapa.
export function ExploreWelcome() {
  const [params, setParams] = useSearchParams();
  const session = useSession();
  const day = useQuery({
    queryKey: ['gestion', 'operacion-dia-resumen'],
    queryFn: ({ signal }) => management<Day>('/operacion/dia', 'GET', undefined, signal),
    enabled: !!session.data,
    staleTime: 60_000,
    retry: false,
  });
  if (params.get('inicio') === '0') return null;
  function focusSearch() {
    document.getElementById('bm-work-search')?.focus();
  }
  const rutas = day.data?.rutas ?? [];
  const done = rutas.filter((r) => r.situacion === 'completada').length;
  const moving = rutas.filter((r) => r.situacion === 'en_curso').length;
  const trouble = rutas.filter((r) =>
    ['interrumpida', 'sin_iniciar', 'no_ejecutada'].includes(r.situacion),
  ).length;
  return (
    <aside className="pr-welcome" aria-label="Comenzar a explorar">
      <Button
        variant="ghost"
        size="icon"
        className="pr-welcome-close"
        aria-label="Ocultar bienvenida"
        onClick={() =>
          setParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.set('inicio', '0');
              return next;
            },
            { replace: true },
          )
        }
      >
        <X size={16} />
      </Button>
      <h2>Explora el territorio de Bagua</h2>
      <p>
        Haz clic en un edificio o calle para saber qué servicio pasa y a qué hora, o busca un
        predio, una persona o una ruta.
      </p>
      {day.data && rutas.length > 0 && (
        <Link to="/bagua-master/operacion" className="pr-welcome-hoy" data-testid="welcome-hoy">
          <strong>Hoy</strong>
          <span>
            {done} de {rutas.length} rutas terminadas{moving ? ` · ${moving} en ruta` : ''}
            {trouble ? ` · ${trouble} con problema` : ''}
            {day.data.alertas.length ? ` · ${day.data.alertas.length} alertas` : ''}
          </span>
        </Link>
      )}
      <ul>
        <li>
          <button type="button" onClick={focusSearch}>
            <strong>Buscar en todo el sistema</strong>
            <span>
              <Search size={14} aria-hidden="true" />
            </span>
          </button>
        </li>
        <li>
          <Link to="/bagua-master/operacion">
            <strong>Operación del día</strong>
            <span>
              <Truck size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
        <li>
          <Link to="/bagua-master/expedientes">
            <strong>Consultar expedientes</strong>
            <span>
              <FolderOpen size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
        <li>
          <Link to="/bagua-master?explorar=rutas">
            <strong>Ver rutas y horarios</strong>
            <span>
              <Route size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}
