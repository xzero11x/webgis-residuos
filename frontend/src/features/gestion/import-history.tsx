import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { management } from './api';
import { Button } from '@/components/ui/button';
import { useWorkspaceEdits } from './workspace-edits-context';

type Change = {
  id: string;
  codigo: string;
  tipo: string;
  campos: string[];
  revertidos: string[];
  version: number;
  bloqueo: string | null;
  anterior: Record<string, unknown> | null;
  posterior: Record<string, unknown>;
};
export function ImportHistory() {
  const [page, setPage] = useState(1),
    [batch, setBatch] = useState(''),
    [selection, setSelection] = useState<Record<string, string[]>>({}),
    [preview, setPreview] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const retry = useRef({ signature: '', key: '' });
  const edits = useWorkspaceEdits(),
    client = useQueryClient();
  const history = useQuery({
    queryKey: ['gestion', 'lotes', page],
    queryFn: () =>
      management<{
        items: {
          id: string;
          estado: string;
          creado_en: string;
          archivo: string | null;
          responsable: string;
          operaciones: number;
        }[];
        hayMas: boolean;
      }>(`/importaciones?page=${page}`),
  });
  const detail = useQuery({
    queryKey: ['gestion', 'lote-cambios', batch],
    queryFn: () =>
      management<{
        items: Change[];
        manifestDisponible: boolean;
        reversiones: { clave: string; motivo: string; responsable: string; creado_en: string }[];
      }>(`/importaciones/${batch}/cambios`),
    enabled: !!batch,
  });
  const selected = (detail.data?.items ?? []).filter(
    (item) => (selection[item.id]?.length ?? 0) > 0,
  );
  async function reverse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setPending(true);
    const motivo = String(new FormData(e.currentTarget).get('motivo') || '');
    const payload = {
      motivo,
      cambios: selected.map((c) => ({ id: c.id, version: c.version, campos: selection[c.id] })),
    };
    const signature = JSON.stringify({ batch, ...payload });
    if (retry.current.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await management<{ repetida: boolean }>(
        `/importaciones/${batch}/revertir`,
        'POST',
        { clave: retry.current.key, ...payload },
      );
      edits.saved();
      setSelection({});
      setPreview(false);
      setMessage(
        result.repetida
          ? 'La reversión ya estaba aplicada. No se repitieron cambios.'
          : 'Reversión guardada con historial. Las altas seleccionadas se archivaron; no se eliminaron.',
      );
      await client.invalidateQueries({ queryKey: ['gestion'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revertir. Recarga la revisión.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="Historial de importaciones">
      <h3>Lotes y reversión selectiva</h3>
      <p>
        Las actualizaciones se deshacen por campo. Las altas sin dependencias se archivan. Cualquier
        edición posterior bloquea la reversión automática del registro.
      </p>
      {history.isPending ? (
        <p role="status">Cargando lotes…</p>
      ) : history.isError ? (
        <div role="alert">
          No se pudieron consultar los lotes.{' '}
          <Button onClick={() => void history.refetch()}>Reintentar lotes</Button>
        </div>
      ) : (
        <>
          <label>
            Lote a revisar
            <select
              value={batch}
              disabled={pending}
              onChange={(e) =>
                edits.run(() => {
                  setBatch(e.target.value);
                  setSelection({});
                  setPreview(false);
                  setError('');
                  setMessage('');
                })
              }
            >
              <option value="">Selecciona un lote</option>
              {history.data.items.map((b) => (
                <option key={b.id} value={b.id}>
                  {new Date(b.creado_en).toLocaleString('es-PE', { timeZone: 'America/Lima' })} ·{' '}
                  {b.archivo || b.id} · {b.estado} · {b.operaciones} operaciones · {b.responsable}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Páginas de lotes">
            <Button
              variant="outline"
              disabled={page === 1 || pending}
              onClick={() => setPage(page - 1)}
            >
              Lotes anteriores
            </Button>
            <span> Página {page} </span>
            <Button
              variant="outline"
              disabled={!history.data.hayMas || pending}
              onClick={() => setPage(page + 1)}
            >
              Más lotes
            </Button>
          </nav>
        </>
      )}
      {batch &&
        (detail.isPending ? (
          <p role="status">Consultando cambios…</p>
        ) : detail.isError ? (
          <div role="alert">
            No se pudieron consultar las operaciones.{' '}
            <Button onClick={() => void detail.refetch()}>Reintentar operaciones</Button>
          </div>
        ) : (
          detail.data && (
            <>
              {!detail.data.manifestDisponible && (
                <p>
                  Este lote no tiene operaciones reversibles verificadas. Puede ser anterior al
                  registro detallado, no estar aplicado o no haber cambiado datos. No se
                  reconstruyen cambios por suposición.
                </p>
              )}
              <form data-unsaved-form className="gm-form" onSubmit={reverse}>
                <fieldset disabled={pending}>
                  <legend>Cambios introducidos por el lote</legend>
                  {detail.data.items.map((change) => (
                    <section key={change.id}>
                      <h4>
                        {change.codigo} · {change.tipo}
                      </h4>
                      {change.bloqueo && <p role="status">{change.bloqueo}</p>}
                      {change.campos.map((field) => (
                        <label key={field}>
                          <input
                            type="checkbox"
                            aria-label={`Revertir ${change.codigo} ${field}`}
                            disabled={!!change.bloqueo || change.revertidos.includes(field)}
                            checked={selection[change.id]?.includes(field) || false}
                            onChange={(e) => {
                              setPreview(false);
                              setSelection((old) => ({
                                ...old,
                                [change.id]: e.target.checked
                                  ? [...(old[change.id] || []), field]
                                  : (old[change.id] || []).filter((v) => v !== field),
                              }));
                            }}
                          />
                          {field}
                          {change.revertidos.includes(field)
                            ? ' · Ya revertido'
                            : field === 'alta'
                              ? ' · Se archivará sin borrar historial'
                              : ` · ${JSON.stringify(change.posterior[field])} → ${JSON.stringify(change.anterior?.[field])}`}
                        </label>
                      ))}
                    </section>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!selected.length}
                    onClick={() => setPreview(true)}
                  >
                    Previsualizar reversión
                  </Button>
                  {preview && (
                    <div role="region" aria-label="Vista previa de reversión">
                      <h4>Efectos seleccionados</h4>
                      <ul>
                        {selected.map((c) => (
                          <li key={c.id}>
                            {c.codigo}: {selection[c.id]!.join(', ')}.{' '}
                            {c.tipo === 'alta'
                              ? 'Archivar el alta conservando historia.'
                              : 'Restaurar valores anteriores de esos campos.'}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Se volverán a comprobar versiones y dependencias al aplicar; si falla un
                        registro, no se aplica ninguno.
                      </p>
                      <label>
                        Motivo de reversión
                        <input name="motivo" required minLength={5} maxLength={1000} />
                      </label>
                      <Button type="submit" disabled={pending}>
                        {pending ? 'Revirtiendo…' : 'Aplicar reversión seleccionada'}
                      </Button>
                    </div>
                  )}
                </fieldset>
              </form>
              <h4>Reversiones registradas</h4>
              {!detail.data.reversiones.length ? (
                <p>Sin reversiones registradas.</p>
              ) : (
                <ul>
                  {detail.data.reversiones.map((r) => (
                    <li key={r.clave}>
                      {new Date(r.creado_en).toLocaleString('es-PE', { timeZone: 'America/Lima' })}{' '}
                      · {r.responsable} · {r.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        ))}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
