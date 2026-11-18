import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, localDay, showDay, type Delivery } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';
type Revision = {
  id: string;
  version: number;
  motivo: string;
  creado_en: string;
  responsable: string;
  anterior: {
    fecha: string;
    material: string;
    cantidad: string | null;
    unidad: string | null;
    anulada: boolean;
  };
  nuevo: Revision['anterior'];
};
export function DeliveryCorrection({
  delivery,
  editable,
}: {
  delivery: Delivery;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [history, setHistory] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const edits = useWorkspaceEdits(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ['gestion', 'entrega-revisiones', delivery.id],
    queryFn: () => management<{ items: Revision[] }>(`/entregas/${delivery.id}/revisiones`),
    enabled: history,
    retry: false,
    gcTime: 0,
  });
  const describe = (v: Revision['anterior']) =>
    `${showDay(v.fecha)} · ${v.material} · ${v.cantidad === null ? 'sin medición' : `${v.cantidad} ${v.unidad}`}${v.anulada ? ' · anulada' : ''}`;
  return (
    <>
      {editable && !delivery.anulada && !editing && (
        <Button variant="outline" onClick={() => edits.run(() => setEditing(true))}>
          Corregir entrega
        </Button>
      )}
      {editing && (
        <form
          className="gm-form"
          data-unsaved-form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setPending(true);
            setError('');
            try {
              await management(`/entregas/${delivery.id}`, 'PATCH', {
                version: delivery.version,
                motivo: f.get('motivo'),
                fecha: f.get('fecha'),
                material: f.get('material'),
                cantidad: f.get('cantidad') ? Number(f.get('cantidad')) : null,
                unidad: f.get('unidad') || null,
                observaciones: f.get('observaciones'),
              });
              edits.saved();
              setEditing(false);
              setMessage('Corrección guardada como nueva versión de la misma entrega.');
              await client.invalidateQueries({ queryKey: ['gestion'] });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No se pudo corregir.');
            } finally {
              setPending(false);
            }
          }}
        >
          <h4>Corregir entrega · versión {delivery.version}</h4>
          <p>
            Se conserva la participación, el predio y la identidad del evento. Esto no registra una
            nueva entrega física.
          </p>
          <label>
            Fecha corregida
            <input
              name="fecha"
              type="date"
              required
              max={localDay()}
              defaultValue={delivery.fecha.slice(0, 10)}
            />
          </label>
          <label>
            Material corregido
            <input name="material" required maxLength={120} defaultValue={delivery.material} />
          </label>
          <label>
            Cantidad corregida (si se midió)
            <input
              name="cantidad"
              type="number"
              min="0.001"
              max="1000000"
              step="any"
              defaultValue={delivery.cantidad ?? ''}
            />
          </label>
          <label>
            Unidad corregida
            <select name="unidad" defaultValue={delivery.unidad ?? ''}>
              <option value="">Sin medición</option>
              <option value="kg">kg</option>
              <option value="unidad">unidad</option>
            </select>
          </label>
          <label>
            Observaciones corregidas
            <textarea name="observaciones" maxLength={1000} defaultValue={delivery.observaciones} />
          </label>
          <label>
            Motivo de corrección
            <input name="motivo" required minLength={5} maxLength={1000} />
          </label>
          <Button type="submit" disabled={pending}>
            Guardar corrección de entrega
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => edits.run(() => setEditing(false))}
          >
            Cancelar corrección
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <details onToggle={(e) => setHistory(e.currentTarget.open)}>
        <summary>Revisiones de esta entrega · versión {delivery.version}</summary>
        {query.isPending ? (
          <p role="status">Consultando revisiones…</p>
        ) : query.isError ? (
          <p role="alert">
            No se pudieron consultar revisiones.{' '}
            <Button onClick={() => void query.refetch()}>Reintentar revisiones</Button>
          </p>
        ) : !query.data.items.length ? (
          <p>Sin correcciones ni anulaciones posteriores al registro inicial.</p>
        ) : (
          <ul className="gm-records">
            {query.data.items.map((r) => (
              <li key={r.id}>
                <strong>
                  Versión {r.version} · {r.responsable} · {showDay(r.creado_en)}
                </strong>
                <p>Anterior: {describe(r.anterior)}</p>
                <p>Vigente en esa revisión: {describe(r.nuevo)}</p>
                <p>{r.motivo}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
