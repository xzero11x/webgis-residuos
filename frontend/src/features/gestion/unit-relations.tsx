import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, localDay, showDay } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';
import { Link, useSearchParams } from 'react-router-dom';
export function UnitRelations({
  predio,
  unidad,
  editable,
}: {
  predio: string;
  unidad: string;
  editable: boolean;
}) {
  const [params] = useSearchParams();
  function personUrl(id: string) {
    const next = new URLSearchParams(params);
    [
      'predio',
      'unidad',
      'trabajo',
      'ampliar',
      'registro',
      'accion',
      'espacial',
      'edificio_revision',
    ].forEach((k) => next.delete(k));
    next.set('persona', id);
    return `?${next}`;
  }
  const [open, setOpen] = useState(false),
    [personSearch, setPersonSearch] = useState(''),
    [kind, setKind] = useState('persona'),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [closing, setClosing] = useState<string | null>(null);
  const edits = useWorkspaceEdits(),
    client = useQueryClient();
  const path = `/predios/${predio}/unidades/${unidad}/relaciones`;
  const rows = useQuery({
    queryKey: ['gestion', 'unidad-relaciones', unidad],
    queryFn: () =>
      management<{
        items: {
          id: string;
          tipo: string;
          desde: string;
          hasta: string | null;
          evidencia: string;
          estado: string | null;
          version: number;
          persona?: string;
          persona_id?: string | null;
          servicio: string | null;
        }[];
        personasPermitidas: boolean;
      }>(path),
    enabled: open,
    retry: false,
    gcTime: 0,
  });
  const people = useQuery({
    queryKey: ['gestion', 'personas-unidad', personSearch],
    queryFn: () =>
      management<{ items: { id: string; nombre: string; codigo: string }[] }>(
        `/personas?${new URLSearchParams({ q: personSearch })}`,
      ),
    enabled: open && editable && kind === 'persona',
  });
  const services = useQuery({
    queryKey: ['gestion', 'catalogos'],
    queryFn: () =>
      management<{ servicios: { id: string; nombre: string; activo: boolean }[] }>('/catalogos'),
    enabled: open && editable,
  });
  async function save(url: string, data: unknown) {
    setPending(true);
    setError('');
    try {
      await management(url, 'POST', data);
      edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
      setMessage('Relación de unidad guardada con historial.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      return false;
    } finally {
      setPending(false);
    }
  }
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Personas y servicios de esta unidad</summary>
      <p>
        Relaciones específicas, sin migrar las del predio. Una asignación no acredita prestación; un
        vínculo no acredita propiedad.
      </p>
      {rows.isPending ? (
        <p role="status">Consultando relaciones…</p>
      ) : rows.isError ? (
        <p role="alert">No se pudieron consultar las relaciones.</p>
      ) : (
        <>
          {!rows.data.items.length && <p>Sin relaciones específicas registradas.</p>}
          {!rows.data.personasPermitidas && <p>Tu perfil no consulta personas vinculadas.</p>}
          <ul className="gm-records">
            {rows.data.items.map((r) => (
              <li key={r.id}>
                <strong>{r.persona ?? r.servicio}</strong>
                <p>
                  {r.tipo.replace(/_/g, ' ')}
                  {r.estado ? ` · ${r.estado}` : ''} · {showDay(r.desde)}
                  {r.hasta ? ` hasta ${showDay(r.hasta)}` : ' · abierta'}
                </p>
                <p>{r.evidencia}</p>
                {r.persona_id && (
                  <Link className="gm-text-link" to={personUrl(r.persona_id)}>
                    Consultar persona {r.persona}
                  </Link>
                )}
                {editable && !r.hasta && (
                  <Button variant="outline" onClick={() => edits.run(() => setClosing(r.id))}>
                    Cerrar relación {r.tipo}
                  </Button>
                )}
                {closing === r.id && (
                  <form
                    className="gm-form"
                    data-unsaved-form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await save(`${path}/${r.id}/cerrar`, {
                          version: r.version,
                          hasta: f.get('hasta'),
                          motivo: f.get('motivo'),
                        })
                      )
                        setClosing(null);
                    }}
                  >
                    <label>
                      Fecha de cierre de unidad
                      <input
                        name="hasta"
                        type="date"
                        defaultValue={localDay()}
                        min={r.desde}
                        required
                      />
                    </label>
                    <label>
                      Motivo de cierre de unidad
                      <input name="motivo" minLength={5} maxLength={1000} required />
                    </label>
                    <Button type="submit" disabled={pending}>
                      Confirmar cierre de relación
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {editable && (
        <form
          className="gm-form"
          data-unsaved-form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await save(path, {
                ...(kind === 'persona'
                  ? { personaId: f.get('referencia'), tipo: f.get('tipo') }
                  : { servicioId: f.get('referencia'), tipo: 'servicio', estado: f.get('estado') }),
                periodo: {
                  desde: f.get('desde'),
                  hasta: f.get('hasta') || null,
                  evidencia: f.get('evidencia'),
                },
              })
            )
              form.reset();
          }}
        >
          <label>
            Clase de relación de unidad
            <select value={kind} onChange={(e) => edits.run(() => setKind(e.target.value))}>
              <option value="persona">Persona</option>
              <option value="servicio">Servicio asignado</option>
            </select>
          </label>
          {kind === 'persona' && (
            <label>
              Buscar persona para esta unidad
              <input
                maxLength={120}
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
              />
            </label>
          )}
          <label>
            Referencia de unidad
            <select name="referencia" aria-label="Referencia de unidad" required defaultValue="">
              <option value="" disabled>
                Selecciona registro autorizado
              </option>
              {kind === 'persona'
                ? people.data?.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre}
                    </option>
                  ))
                : services.data?.servicios
                    .filter((s) => s.activo)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
            </select>
          </label>
          {kind === 'persona' ? (
            <label>
              Tipo de vínculo de unidad
              <select name="tipo">
                {['contribuyente', 'ocupante', 'propietario_declarado', 'responsable', 'otro'].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : (
            <label>
              Estado del servicio de unidad
              <select name="estado">
                {['prevista', 'pendiente', 'confirmada'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Desde en unidad
            <input name="desde" type="date" required defaultValue={localDay()} />
          </label>
          <label>
            Hasta en unidad (opcional)
            <input name="hasta" type="date" />
          </label>
          <label>
            Evidencia de relación de unidad
            <input name="evidencia" required minLength={5} maxLength={1000} />
          </label>
          <Button type="submit" disabled={pending}>
            Guardar relación de unidad
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
