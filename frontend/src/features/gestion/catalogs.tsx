import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';

type Entry = { id: string; codigo: string; nombre: string; activo: boolean };
export function Catalogs() {
  const client = useQueryClient(),
    edits = useWorkspaceEdits();
  const [kind, setKind] = useState<'servicios' | 'materiales'>('servicios');
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['gestion', 'catalogos-configuracion'],
    queryFn: () =>
      management<{ servicios: Entry[]; materiales: Entry[]; aviso: string }>(
        '/catalogos/configuracion',
      ),
    retry: false,
  });
  async function save(path: string, method: string, data: unknown) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await management(path, method, data);
      if (method === 'POST') edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
      setMessage('Catálogo actualizado; se conserva el historial.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el catálogo.');
      return false;
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="gm-single">
      <h3>Catálogos de prueba</h3>
      <p>
        Datos de prueba — no oficiales. Desactivar conserva las asignaciones y entregas existentes.
        Los nombres se mantienen para no cambiar el significado del historial.
      </p>
      <label>
        Tipo de catálogo
        <select
          value={kind}
          disabled={pending}
          onChange={(e) => edits.run(() => setKind(e.target.value as typeof kind))}
        >
          <option value="servicios">Servicios</option>
          <option value="materiales">Materiales sugeridos</option>
        </select>
      </label>
      {query.isPending ? (
        <p role="status">Cargando catálogos…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>No se pudo cargar. Revisa los permisos.</p>
          <Button onClick={() => void query.refetch()}>Reintentar catálogos</Button>
        </div>
      ) : (
        <>
          <ul className="gm-records">
            {query.data[kind].map((entry) => (
              <li key={entry.id}>
                <strong>{entry.nombre}</strong>
                <span>
                  {entry.codigo} · {entry.activo ? 'Activo' : 'Inactivo'}
                </span>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${entry.activo ? 'Desactivar' : 'Activar'} esta entrada de prueba conservando su historial?`,
                      )
                    )
                      void save(`/catalogos/${kind}/${entry.id}`, 'PATCH', {
                        activo: !entry.activo,
                      });
                  }}
                >
                  {entry.activo ? 'Desactivar' : 'Activar'} {entry.codigo}
                </Button>
              </li>
            ))}
          </ul>
          {!query.data[kind].length && <p>Sin entradas registradas para este catálogo.</p>}
          <form
            className="gm-form"
            data-unsaved-form
            key={kind}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                values = new FormData(form);
              if (
                await save(`/catalogos/${kind}`, 'POST', {
                  codigo: values.get('codigo'),
                  nombre: values.get('nombre'),
                })
              )
                form.reset();
            }}
          >
            <h4>Añadir entrada de prueba</h4>
            <label>
              Código del catálogo
              <input
                name="codigo"
                required
                pattern="TEST-[A-Z0-9_-]+"
                maxLength={55}
                placeholder="TEST-EJEMPLO…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              Nombre de prueba
              <input name="nombre" required minLength={2} maxLength={120} />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar entrada'}
            </Button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
