import { useSearchParams } from 'react-router-dom';

// Capas del mapa: territorio (edificios y calles de Overture) o rutas documentales (DWG).
// Los expedientes y servicios tienen espacios propios en la navegación principal.
export function ExploreViews({
  routesOn,
  onRoutes,
  onExplore,
}: {
  routesOn: boolean;
  onRoutes: () => void;
  onExplore: () => void;
}) {
  const [, setParams] = useSearchParams();
  const view = routesOn ? 'rutas' : 'territorio';
  function choose(value: string) {
    onExplore();
    if ((value === 'rutas') !== routesOn) onRoutes();
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('explorar', value);
      ['predio', 'persona', 'unidad', 'ficha', 'espacial', 'edificio_revision'].forEach((k) =>
        next.delete(k),
      );
      return next;
    });
  }
  return (
    <nav className="bm-explore-views" aria-label="Capas del territorio">
      {['territorio', 'rutas'].map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => choose(value)}
        >
          {value[0]!.toUpperCase() + value.slice(1)}
        </button>
      ))}
    </nav>
  );
}
