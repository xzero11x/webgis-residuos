import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-2xl font-semibold">No encontramos esta página</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Puedes volver al espacio de trabajo territorial.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Volver al mapa</Link>
      </Button>
    </div>
  );
}
