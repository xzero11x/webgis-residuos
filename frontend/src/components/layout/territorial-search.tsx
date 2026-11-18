import { Search, X } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';

export function TerritorialSearch({ mobile = false }: { mobile?: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const value = params.get('q') ?? '';
  function update(q: string) {
    const next = new URLSearchParams(location.pathname === '/' ? params : undefined);
    if (q) next.set('q', q);
    else next.delete('q');
    navigate({ pathname: '/', search: next.toString() }, { replace: true });
  }
  return (
    <div className={mobile ? 'mobile-map-search' : 'header-search'}>
      <Search className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
      <Input
        type="search"
        maxLength={120}
        value={value}
        onChange={(event) => update(event.target.value)}
        aria-label={mobile ? 'Buscar en el mapa en móvil' : 'Buscar en el mapa'}
        placeholder={
          params.get('vista') === 'predios'
            ? 'Código, dirección o persona…'
            : 'Buscar ruta o archivo municipal…'
        }
        className="h-8 border-border bg-muted/45 pr-8 pl-8.5 focus-visible:bg-background"
      />
      {value && (
        <button
          type="button"
          onClick={() => update('')}
          className="absolute right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Limpiar búsqueda"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
