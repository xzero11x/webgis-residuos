import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, type User } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';

type Account = User & { activo: boolean; version: number };
export function Users() {
  const client = useQueryClient(),
    edits = useWorkspaceEdits();
  const [selected, setSelected] = useState<Account | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['gestion', 'usuarios'],
    queryFn: () => management<{ items: Account[] }>('/usuarios'),
    retry: false,
  });
  return (
    <section className="gm-single">
      <h3>Cuentas de prueba</h3>
      <p>
        Perfiles técnicos provisionales. Cambiar permisos o desactivar otra cuenta revoca sus
        sesiones. Las contraseñas no se muestran ni se guardan en historial.
      </p>
      {query.isPending ? (
        <p role="status">Cargando cuentas…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>No se pudieron consultar las cuentas. Revisa tus permisos.</p>
          <Button onClick={() => void query.refetch()}>Reintentar cuentas</Button>
        </div>
      ) : (
        <ul className="gm-records">
          {query.data.items.map((account) => (
            <li key={account.id}>
              <strong>{account.usuario}</strong>
              <span>
                {account.nombre} · {account.rol} · {account.activo ? 'Activa' : 'Inactiva'}
              </span>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  edits.run(() => {
                    setSelected(account);
                    setError('');
                    setMessage('');
                  })
                }
              >
                Editar cuenta {account.usuario}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => edits.run(() => setSelected(null))}
      >
        Nueva cuenta de prueba
      </Button>
      <form
        className="gm-form"
        data-unsaved-form
        key={selected?.id ?? 'nueva'}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          setPending(true);
          setError('');
          setMessage('');
          try {
            await management(
              selected ? `/usuarios/${selected.id}` : '/usuarios',
              selected ? 'PATCH' : 'POST',
              selected
                ? {
                    nombre: f.get('nombre'),
                    rol: f.get('rol'),
                    activo: f.get('activo') === 'on',
                    version: selected.version,
                  }
                : {
                    usuario: f.get('usuario'),
                    nombre: f.get('nombre'),
                    rol: f.get('rol'),
                    password: f.get('password'),
                  },
            );
            edits.saved();
            setSelected(null);
            form.reset();
            await client.invalidateQueries({ queryKey: ['gestion', 'usuarios'] });
            setMessage('Cuenta guardada. Los permisos se comprueban en el servidor.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar.');
          } finally {
            setPending(false);
          }
        }}
      >
        <h4>{selected ? `Editar ${selected.usuario}` : 'Crear cuenta'}</h4>
        {!selected && (
          <label>
            Usuario nuevo
            <input
              name="usuario"
              autoComplete="off"
              spellCheck={false}
              pattern="[a-z0-9_-]{3,50}"
              required
            />
          </label>
        )}
        <label>
          Nombre de prueba de la cuenta
          <input
            name="nombre"
            defaultValue={selected?.nombre}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          Perfil técnico
          <select name="rol" defaultValue={selected?.rol ?? 'consulta'}>
            <option value="consulta">Consulta</option>
            <option value="registro">Registro</option>
            <option value="administrador">Administrador</option>
          </select>
        </label>
        {selected ? (
          <label>
            <input type="checkbox" name="activo" defaultChecked={selected.activo} />
            Cuenta activa
          </label>
        ) : (
          <label>
            Contraseña inicial (mínimo 16 caracteres)
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={16}
              maxLength={200}
              required
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cuenta'}
        </Button>
      </form>
      {selected && (
        <PasswordReset
          key={selected.id}
          account={selected}
          onSaved={() => {
            setSelected(null);
            setMessage('Contraseña restablecida. Se revocaron todas las sesiones de la cuenta.');
          }}
        />
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function PasswordReset({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const client = useQueryClient(),
    edits = useWorkspaceEdits();
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <details>
      <summary>Restablecer contraseña de {account.usuario}</summary>
      <p>
        Solo para recuperar el acceso de otra cuenta activa. Requiere tu contraseña administrativa y
        revoca todas las sesiones de la cuenta seleccionada. Entrega la nueva contraseña por un
        canal autorizado.
      </p>
      <form
        className="gm-form"
        data-unsaved-form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError('');
          if (f.get('nueva') !== f.get('confirmar')) {
            setError('Las contraseñas nuevas no coinciden.');
            return;
          }
          setPending(true);
          try {
            await management(`/usuarios/${account.id}/password`, 'POST', {
              actualAdministrador: f.get('actualAdministrador'),
              nueva: f.get('nueva'),
              motivo: f.get('motivo'),
              version: account.version,
            });
            edits.saved();
            await client.invalidateQueries({ queryKey: ['gestion', 'usuarios'] });
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo restablecer.');
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Tu contraseña administrativa
          <input
            name="actualAdministrador"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
        <label>
          Nueva contraseña para la cuenta
          <input
            name="nueva"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={200}
          />
        </label>
        <label>
          Confirmar contraseña para la cuenta
          <input
            name="confirmar"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={200}
          />
        </label>
        <label>
          Motivo del restablecimiento
          <textarea name="motivo" required minLength={5} maxLength={1000} />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={pending || !account.activo}>
          {pending ? 'Restableciendo…' : 'Restablecer contraseña y revocar sesiones'}
        </Button>
      </form>
    </details>
  );
}
export function PasswordChange() {
  const client = useQueryClient(),
    edits = useWorkspaceEdits();
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="gm-single">
      <h3>Cambiar mi contraseña</h3>
      <p>Al guardar se cerrarán todas tus sesiones. Ingresa nuevamente con la nueva contraseña.</p>
      <form
        className="gm-form"
        data-unsaved-form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setPending(true);
          setError('');
          if (f.get('nueva') !== f.get('confirmar')) {
            setError('Las contraseñas nuevas no coinciden.');
            setPending(false);
            return;
          }
          try {
            await management('/password', 'POST', {
              actual: f.get('actual'),
              nueva: f.get('nueva'),
            });
            edits.saved();
            client.removeQueries({
              predicate: (query) =>
                query.queryKey[0] === 'gestion' && query.queryKey[1] !== 'sesion',
            });
            await client.resetQueries({ queryKey: ['gestion', 'sesion'] });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo cambiar.');
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Contraseña actual
          <input name="actual" type="password" autoComplete="current-password" required />
        </label>
        <label>
          Nueva contraseña
          <input
            name="nueva"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={200}
          />
        </label>
        <label>
          Confirmar nueva contraseña
          <input
            name="confirmar"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={200}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Actualizando…' : 'Guardar contraseña y cerrar sesiones'}
        </Button>
      </form>
    </section>
  );
}
