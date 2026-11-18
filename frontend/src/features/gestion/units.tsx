import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';
import { UnitRelations } from './unit-relations';
type Unit = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  evidencia: string;
  activa: boolean;
  version: number;
};
export function Units({ id, editable }: { id: string; editable: boolean }) {
  const [params] = useSearchParams();
  const requestedUnit = params.get('unidad');
  const [selected, setSelected] = useState<Unit | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState('');
  const client = useQueryClient(),
    edits = useWorkspaceEdits();
  const query = useQuery({
    queryKey: ['gestion', 'unidades', id],
    queryFn: () => management<{ items: Unit[] }>(`/predios/${id}/unidades`),
  });
  useEffect(() => {
    if (requestedUnit && query.data?.items.some((u) => u.id === requestedUnit)) {
      const element = document.getElementById(`unidad-${requestedUnit}`);
      element?.scrollIntoView({ block: 'nearest' });
      element?.focus({ preventScroll: true });
    }
  }, [requestedUnit, query.data]);
  return (
    <section>
      <h3>Unidades y secciones registradas</h3>
      <p>
        Referencias administrativas de prueba dentro del predio. No equivalen a edificios Overture
        ni acreditan propiedad o límites.
      </p>
      {query.isPending ? (
        <p role="status">Cargando unidades…</p>
      ) : query.isError ? (
        <p role="alert">No se pudieron consultar unidades.</p>
      ) : (
        <ul className="gm-records">
          {query.data.items.map((u) => (
            <li key={u.id} id={`unidad-${u.id}`} tabIndex={-1}>
              <strong>
                {u.codigo} · {u.nombre}
              </strong>
              <p>
                {u.tipo} · {u.activa ? 'Activa' : 'Inactiva'} · {u.evidencia}
              </p>
              {editable && (
                <Button variant="outline" onClick={() => edits.run(() => setSelected(u))}>
                  Editar unidad {u.codigo}
                </Button>
              )}
              <UnitRelations predio={id} unidad={u.id} editable={editable && u.activa} />
            </li>
          ))}
        </ul>
      )}
      {query.data?.items.length === 0 && (
        <p>Sin unidades registradas. No se generan subdivisiones por la geometría.</p>
      )}
      {editable && (
        <>
          <Button variant="outline" onClick={() => edits.run(() => setSelected(null))}>
            Nueva unidad o sección
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
              try {
                await management(
                  `/predios/${id}/unidades${selected ? `/${selected.id}` : ''}`,
                  selected ? 'PATCH' : 'POST',
                  selected
                    ? {
                        nombre: f.get('nombre'),
                        evidencia: f.get('evidencia'),
                        activa: f.get('activa') === 'on',
                        version: selected.version,
                      }
                    : {
                        codigo: f.get('codigo'),
                        nombre: f.get('nombre'),
                        tipo: f.get('tipo'),
                        evidencia: f.get('evidencia'),
                      },
                );
                edits.saved();
                setSelected(null);
                form.reset();
                await client.invalidateQueries({ queryKey: ['gestion'] });
                setMessage('Unidad guardada con historial.');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo guardar.');
              } finally {
                setPending(false);
              }
            }}
          >
            {!selected && (
              <>
                <label>
                  Código de unidad
                  <input name="codigo" pattern="[A-Za-z0-9_-]{1,60}" required />
                </label>
                <label>
                  Tipo de subdivisión
                  <select name="tipo">
                    <option value="unidad">Unidad</option>
                    <option value="seccion">Sección</option>
                  </select>
                </label>
              </>
            )}
            <label>
              Nombre de unidad
              <input name="nombre" required maxLength={120} defaultValue={selected?.nombre} />
            </label>
            <label>
              Evidencia de unidad
              <input
                name="evidencia"
                required
                minLength={5}
                maxLength={1000}
                defaultValue={selected?.evidencia}
              />
            </label>
            {selected && (
              <label>
                <input type="checkbox" name="activa" defaultChecked={selected.activa} />
                Unidad activa
              </label>
            )}
            <Button type="submit" disabled={pending}>
              Guardar unidad
            </Button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
