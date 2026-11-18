import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { management, type User } from '@/features/gestion/api';
import { useSession } from './use-session';

export function LoginCard({ onDone }: { onDone?: () => void }) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await management('/sesion', 'POST', {
        usuario: form.get('usuario'),
        password: form.get('password'),
      });
      await client.invalidateQueries({ queryKey: ['gestion'] });
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="pr-card pr-login" aria-labelledby="login-title">
      <div className="pr-brand-mark" aria-hidden="true" style={{ marginBottom: 16 }}>
        <MapPinned size={16} />
      </div>
      <h1 id="login-title">Ingresa a WEBGIS BAGUA</h1>
      <p>
        El mapa es público. Con tu cuenta consultas expedientes, servicios y actividades según tu
        perfil.
      </p>
      <form onSubmit={submit}>
        <label>
          Usuario
          <input
            className="pr-field"
            name="usuario"
            autoComplete="username"
            required
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label>
          Contraseña
          <input
            className="pr-field"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="pr-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </section>
  );
}

/** Contenido que exige sesión (y, opcionalmente, un perfil). Explica cada estado. */
export function SessionGate({
  roles,
  children,
}: {
  roles?: User['rol'][];
  children: (user: User) => ReactNode;
}) {
  const session = useSession();
  if (session.isPending)
    return (
      <div className="pr-container" role="status" aria-label="Comprobando acceso">
        <div className="pr-skeleton" style={{ height: 28, width: 260 }} />
        <div className="pr-skeleton" style={{ height: 220, marginTop: 24 }} />
      </div>
    );
  if (session.error instanceof ApiError && session.error.status === 401) return <LoginCard />;
  if (session.isError)
    return (
      <div className="pr-container" role="alert">
        <p>No se pudo comprobar tu acceso. Revisa la conexión e inténtalo de nuevo.</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  if (roles && !roles.includes(session.data.rol))
    return (
      <div className="pr-container">
        <div className="pr-card pr-empty">
          <strong>Este espacio requiere otro perfil</strong>
          Tu cuenta ({session.data.rol}) no tiene acceso. Consulta con administración.
        </div>
      </div>
    );
  return <>{children(session.data)}</>;
}
