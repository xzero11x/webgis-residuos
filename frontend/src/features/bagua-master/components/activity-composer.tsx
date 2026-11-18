import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, localDay, type Detail } from '@/features/gestion/api';
import { WorkspaceEdits } from '@/features/gestion/workspace-edits';
import { useWorkspaceEdits } from '@/features/gestion/workspace-edits-context';

export function ActivityComposer(props: {
  data: Detail;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <WorkspaceEdits>
      <Composer {...props} />
    </WorkspaceEdits>
  );
}
function Composer({
  data,
  onClose,
  onSaved,
}: {
  data: Detail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edits = useWorkspaceEdits(),
    client = useQueryClient();
  const key = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await management('/entregas', 'POST', {
        participacionId: form.get('participacion'),
        fecha: form.get('fecha'),
        material: form.get('material'),
        cantidad: form.get('cantidad') ? Number(form.get('cantidad')) : null,
        unidad: form.get('cantidad') ? form.get('unidad') : null,
        observaciones: form.get('observaciones') || '',
        clave: key.current,
      });
      edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la entrega.');
    } finally {
      setPending(false);
    }
  }
  const participants = data.participaciones.filter((p) => !p.hasta || p.hasta >= localDay());
  return (
    <section className="bm-activity-composer" aria-label="Registrar entrega en el predio">
      <h3>Registrar entrega</h3>
      <p>{data.predio.direccion}</p>
      {!participants.length ? (
        <>
          <p>
            No hay una participación vigente registrada. Abre la ficha completa para registrar o
            revisar la participación antes de añadir una entrega.
          </p>
          <Button variant="outline" onClick={onClose}>
            Volver a la ficha
          </Button>
        </>
      ) : (
        <form className="gm-form" onSubmit={submit} onChange={() => edits.dirty()}>
          <label>
            Participación
            <select name="participacion" required>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha de entrega
            <input name="fecha" type="date" defaultValue={localDay()} max={localDay()} required />
          </label>
          <label>
            Material entregado
            <input
              name="material"
              placeholder="Por ejemplo, cartón limpio"
              maxLength={200}
              required
            />
          </label>
          <div className="bm-measurement">
            <label>
              Cantidad medida (opcional)
              <input name="cantidad" type="number" inputMode="decimal" step="any" min="0.001" />
            </label>
            <label>
              Unidad
              <select name="unidad">
                <option value="kg">kg</option>
                <option value="unidad">unidad</option>
              </select>
            </label>
          </div>
          <p className="bm-composer-help">
            Si no hubo medición, deja la cantidad vacía. No se registrará como cero.
          </p>
          <label>
            Observaciones (opcional)
            <textarea name="observaciones" maxLength={2000} rows={2} />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="bm-composer-actions">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar entrega'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => edits.run(onClose)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
