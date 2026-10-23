import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Database,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { env } from '@/config/env';
import { useHealth, useReadiness } from '@/hooks/use-health';
import { cn } from '@/lib/utils';

export function SystemPage() {
  const health = useHealth();
  const readiness = useReadiness();
  const isFetching = health.isFetching || readiness.isFetching;
  const rows = [
    {
      label: 'API de la aplicación',
      description: 'Comunicación del frontend con el backend.',
      icon: Server,
      pending: health.isPending,
      error: health.isError,
    },
    {
      label: 'PostgreSQL + PostGIS',
      description: 'Conexión y disponibilidad de la extensión espacial.',
      icon: Database,
      pending: readiness.isPending,
      error: readiness.isError,
    },
  ];

  return (
    <section className="system-page">
      <p className="eyebrow">Entorno de trabajo</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-[-1px]">Estado del sistema</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => {
            void health.refetch();
            void readiness.refetch();
          }}
        >
          <RefreshCw className={cn(isFetching && 'animate-spin')} />
          Comprobar conexión
        </Button>
      </div>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        Comprueba la conexión entre la aplicación, la API y su base de datos espacial.
      </p>
      <div className="mt-9 overflow-hidden rounded-2xl border bg-background">
        {rows.map(({ label, description, icon: Icon, pending, error }) => (
          <div key={label} className="flex items-center gap-4 border-b p-5 last:border-0 sm:p-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Icon className="size-5 text-foreground/70" strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">{label}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <span
              role="status"
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-medium',
                error
                  ? 'bg-amber-50 text-amber-800'
                  : pending
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/7 text-primary',
              )}
            >
              {pending ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : error ? (
                <CircleAlert className="size-3" />
              ) : (
                <Check className="size-3" />
              )}
              {pending ? 'Comprobando' : error ? 'Sin conexión' : 'Conectado'}
            </span>
          </div>
        ))}
      </div>
      {(health.isError || readiness.isError) && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"
        >
          {health.isError
            ? 'No se pudo contactar con la API. Comprueba que el backend esté iniciado y vuelve a intentarlo.'
            : 'La API responde, pero PostgreSQL/PostGIS no está disponible. Comprueba el contenedor de base de datos y sus credenciales.'}
        </p>
      )}
      <div className="mt-5 rounded-2xl border bg-background p-6">
        <div className="flex items-center gap-2.5">
          <Globe2 className="size-4 text-primary" />
          <h2 className="text-sm font-medium">Mapa base</h2>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {env.VITE_MAP_STYLE_URL ? 'Proveedor configurado' : 'OpenFreeMap por defecto'}
          </span>
        </div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          {env.VITE_MAP_STYLE_URL ? (
            'Hay una URL de estilo configurada. La disponibilidad del proveedor se comprueba al abrir el mapa.'
          ) : (
            <>
              Se utiliza OpenFreeMap. Puedes cambiar{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">VITE_MAP_STYLE_URL</code>{' '}
              y reiniciar el entorno de desarrollo o reconstruir el frontend.
            </>
          )}
        </p>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-xs text-muted-foreground">Versión funcional DEMO · Modelo provisional</p>
        <Button asChild variant="ghost" size="sm">
          <a href={`${env.VITE_API_BASE_URL}/docs/`} target="_blank" rel="noreferrer">
            Abrir Swagger
            <ArrowUpRight />
          </a>
        </Button>
      </div>
    </section>
  );
}
