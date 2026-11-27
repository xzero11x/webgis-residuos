import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management, showDay, type User } from '@/features/gestion/api';
import { kgText, limaToday, shortName } from './tipos';

// Pesaje en la oficina: el ticket de la balanza del relleno se registra aquí, no en el vehículo.
// Primero lo que falta (llegadas al relleno sin ticket), luego lo registrado, con anulación motivada.

interface Vehiculo {
  placa: string;
  descripcion: string;
  tipo: string;
  taraKg: number | null;
  activo: boolean;
}
interface Pendiente {
  ejecucionId: string;
  fecha: string;
  ruta: string | null;
  vehiculo: string;
  placa: string | null;
  llegadas: number;
  tickets: number;
  ultimaLlegada: string | null;
}
interface Ticket {
  id: string;
  ticket: string;
  fecha: string;
  hora: string | null;
  vehiculo: string;
  pesoBrutoKg: number;
  taraKg: number;
  pesoNetoKg: number;
  ruta: string | null;
  registradoPor: string;
  observaciones: string;
}
interface Data {
  desde: string;
  hasta: string;
  items: Ticket[];
  pendientes: Pendiente[];
}
interface Draft {
  ejecucionId: string | null;
  fecha: string;
  hora: string;
  placa: string;
  ruta: string;
}

export function Pesaje({ user }: { user: User }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['gestion', 'pesajes'],
    queryFn: ({ signal }) => management<Data>('/pesajes', 'GET', undefined, signal),
  });
  const vehicles = useQuery({
    queryKey: ['gestion', 'vehiculos'],
    queryFn: ({ signal }) =>
      management<{ items: Vehiculo[] }>('/vehiculos', 'GET', undefined, signal),
    staleTime: 300_000,
  });
  const voidTicket = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      management(`/pesajes/${id}/anular`, 'POST', { motivo }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['gestion', 'pesajes'] });
      void client.invalidateQueries({ queryKey: ['gestion', 'operacion-dia'] });
    },
  });
  const canWrite = user.rol !== 'consulta';
  const data = query.data;
  const byDay = new Map<string, number>();
  for (const t of data?.items ?? []) byDay.set(t.fecha, (byDay.get(t.fecha) ?? 0) + t.pesoNetoKg);

  return (
    <div className="op-pesaje" data-testid="op-pesaje">
      {notice && (
        <p className="pr-notice is-info" role="status">
          {notice}
        </p>
      )}
      <section aria-labelledby="op-pend-t">
        <div className="pr-section-head">
          <div>
            <h3 id="op-pend-t">Llegadas al relleno sin ticket</h3>
            <p>
              Cada llegada que el chofer marcó en el relleno espera su ticket de balanza. Regístralo
              con el número impreso.
            </p>
          </div>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft({ ejecucionId: null, fecha: limaToday(), hora: '', placa: '', ruta: '' })
              }
            >
              Ticket sin ruta
            </Button>
          )}
        </div>
        {query.isPending && <div className="pr-skeleton" style={{ height: 120 }} />}
        {data && !data.pendientes.length && (
          <div className="pr-empty">
            <strong>Todo pesado</strong>No hay llegadas sin ticket en las últimas dos semanas.
          </div>
        )}
        {data && data.pendientes.length > 0 && (
          <ul className="pr-list">
            {data.pendientes.map((p) => (
              <li key={p.ejecucionId}>
                <div className="pr-list-main">
                  <strong>
                    {showDay(p.fecha)} · {shortName(p.ruta) ?? p.vehiculo}
                  </strong>
                  <span>
                    {p.vehiculo} · {p.llegadas - p.tickets} de {p.llegadas} ticket(s) por registrar
                    {p.ultimaLlegada ? ` · llegó ${p.ultimaLlegada}` : ''}
                  </span>
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ejecucionId: p.ejecucionId,
                        fecha: p.fecha,
                        hora: p.ultimaLlegada ?? '',
                        placa: p.placa ?? '',
                        ruta: p.ruta ?? '',
                      })
                    }
                  >
                    <Scale size={14} aria-hidden="true" /> Registrar ticket
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft && (
        <TicketForm
          key={`${draft.ejecucionId}-${draft.fecha}`}
          draft={draft}
          vehicles={vehicles.data?.items ?? []}
          onCancel={() => setDraft(null)}
          onSaved={(text) => {
            setDraft(null);
            setNotice(text);
            void client.invalidateQueries({ queryKey: ['gestion', 'pesajes'] });
            void client.invalidateQueries({ queryKey: ['gestion', 'operacion-dia'] });
          }}
        />
      )}

      <section aria-labelledby="op-tickets-t">
        <div className="pr-section-head">
          <div>
            <h3 id="op-tickets-t">Tickets registrados · últimas dos semanas</h3>
            <p>
              {data
                ? `${data.items.length} tickets · ${kgText(data.items.reduce((n, t) => n + t.pesoNetoKg, 0))} netas`
                : ''}
            </p>
          </div>
        </div>
        {data && (
          <div className="op-tabla-scroll">
            <table className="op-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ticket</th>
                  <th>Ruta</th>
                  <th>Vehículo</th>
                  <th>Bruto</th>
                  <th>Tara</th>
                  <th>Neto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {showDay(t.fecha)} {t.hora ?? ''}
                    </td>
                    <td className="pr-mono">{t.ticket}</td>
                    <td>{shortName(t.ruta) ?? '—'}</td>
                    <td>{t.vehiculo}</td>
                    <td>{kgText(t.pesoBrutoKg)}</td>
                    <td>{kgText(t.taraKg)}</td>
                    <td>
                      <strong>{kgText(t.pesoNetoKg)}</strong>
                    </td>
                    <td>
                      {canWrite && (
                        <button
                          type="button"
                          className="pr-link-button"
                          disabled={voidTicket.isPending}
                          onClick={() => {
                            const motivo = window.prompt(
                              `Motivo para anular el ticket ${t.ticket} (mínimo 5 caracteres):`,
                            );
                            if (motivo && motivo.trim().length >= 5)
                              voidTicket.mutate({ id: t.id, motivo: motivo.trim() });
                          }}
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {voidTicket.isError && (
          <p role="alert" className="pr-error">
            {voidTicket.error instanceof Error ? voidTicket.error.message : 'No se pudo anular.'}
          </p>
        )}
      </section>
    </div>
  );
}

function TicketForm({
  draft,
  vehicles,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  vehicles: Vehiculo[];
  onCancel: () => void;
  onSaved: (text: string) => void;
}) {
  const [placa, setPlaca] = useState(draft.placa);
  const vehicle = vehicles.find((v) => v.placa === placa);
  const [bruto, setBruto] = useState('');
  const [tara, setTara] = useState(vehicle?.taraKg ? String(vehicle.taraKg) : '');
  const save = useMutation({
    mutationFn: (body: unknown) =>
      management<{ pesoNetoKg: number; ticket: string }>('/pesajes', 'POST', body),
    onSuccess: (row) => onSaved(`Ticket ${row.ticket} guardado: ${kgText(row.pesoNetoKg)} netas.`),
  });
  const neto = Number(bruto) - Number(tara);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      ejecucionId: draft.ejecucionId,
      destino: 'relleno',
      fecha: String(form.get('fecha')),
      hora: String(form.get('hora') || '') || null,
      ticket: String(form.get('ticket')).trim(),
      vehiculo: vehicle?.descripcion ?? placa,
      pesoBrutoKg: Number(bruto),
      taraKg: Number(tara),
      observaciones: String(form.get('observaciones') ?? '').trim(),
    });
  }
  return (
    <form className="pr-card pr-card-pad op-form" onSubmit={submit} data-testid="op-ticket-form">
      <h3>Ticket de balanza{draft.ruta ? ` · ${shortName(draft.ruta)}` : ''}</h3>
      <div className="op-form-grid">
        <label>
          N.° de ticket
          <input
            className="pr-field"
            name="ticket"
            required
            minLength={2}
            maxLength={40}
            autoFocus
          />
        </label>
        <label>
          Fecha
          <input
            className="pr-field"
            type="date"
            name="fecha"
            defaultValue={draft.fecha}
            max={limaToday()}
            required
          />
        </label>
        <label>
          Hora de pesaje
          <input className="pr-field" type="time" name="hora" defaultValue={draft.hora} />
        </label>
        <label>
          Vehículo
          <select
            className="pr-field"
            value={placa}
            required
            onChange={(event) => {
              setPlaca(event.target.value);
              const v = vehicles.find((x) => x.placa === event.target.value);
              if (v?.taraKg) setTara(String(v.taraKg));
            }}
          >
            <option value="">Elige el vehículo</option>
            {vehicles
              .filter((v) => v.activo)
              .map((v) => (
                <option key={v.placa} value={v.placa}>
                  {v.descripcion}
                </option>
              ))}
          </select>
        </label>
        <label>
          Peso bruto (kg)
          <input
            className="pr-field"
            type="number"
            inputMode="decimal"
            min={1}
            step={10}
            required
            value={bruto}
            onChange={(event) => setBruto(event.target.value)}
          />
        </label>
        <label>
          Tara (kg)
          <input
            className="pr-field"
            type="number"
            inputMode="decimal"
            min={0}
            step={10}
            required
            value={tara}
            onChange={(event) => setTara(event.target.value)}
          />
        </label>
      </div>
      <label>
        Observaciones
        <input className="pr-field" name="observaciones" maxLength={300} />
      </label>
      <p className="op-neto" aria-live="polite">
        Peso neto: <strong>{bruto && tara && neto > 0 ? kgText(neto) : '—'}</strong>
      </p>
      {save.isError && (
        <p role="alert" className="pr-error">
          {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
        </p>
      )}
      <div className="pr-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending || !(neto > 0)}>
          Guardar ticket
        </Button>
      </div>
    </form>
  );
}
