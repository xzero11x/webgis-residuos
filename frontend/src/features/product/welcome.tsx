import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, FolderOpen, Route, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Estado inicial del mapa: explica qué se puede hacer y adónde ir, sin tapar el mapa.
export function ExploreWelcome() {
  const [params, setParams] = useSearchParams();
  if (params.get('inicio') === '0') return null;
  function focusSearch() {
    document.getElementById('bm-work-search')?.focus();
  }
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
        Haz clic en un edificio o calle, o busca un predio, una persona o una ruta. El mapa y los
        expedientes comparten la misma información.
      </p>
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
          <Link to="/bagua-master/expedientes">
            <strong>Consultar expedientes</strong>
            <span>
              <FolderOpen size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
        <li>
          <Link to="/bagua-master?explorar=rutas">
            <strong>Ver rutas documentales</strong>
            <span>
              <Route size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
        <li>
          <Link to="/bagua-master/servicios">
            <strong>Registrar actividad</strong>
            <span>
              <ClipboardList size={14} aria-hidden="true" />
            </span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}
