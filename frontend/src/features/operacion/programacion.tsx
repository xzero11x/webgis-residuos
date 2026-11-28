import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, showDay, type User } from '@/features/gestion/api';
import { SERVICIO_NOMBRE, daysText, limaToday, shortName, type Servicio } from './tipos';

// Programación de las rutas: días, horario, vehículo y sectores. Cambiarla exige un motivo y la
// fecha desde la que rige, y puede publicar el aviso al vecino en el mismo paso. Los puntos de
// control se corren con el nuevo horario. Nada se borra: queda el historial de cambios.

interface Programa {
  id: string;
  ruta: string;
  rutaNombre: string;
  color: string;
  servicio: Servicio;
  nombre: string;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  sectores: string[];
  vehiculo: string;
  vehiculoPlaca: string | null;
  operador: string;
  puntos: number;
  cambios: {
    id: string;
    motivo: string;
    desde: string;
    creadoEn: string;
    usuario: string | null;
    anterior: Record<string, unknown>;
    nuevo: Record<string, unknown>;
  }[];
}
interface Vehiculo {
  placa: string;
  descripcion: string;
  activo: boolean;
}
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const FIELD: Record<string, string> = {
  dias: 'días',
  horaInicio: 'inicio',
  horaFin: 'fin',
  vehiculo: 'vehículo',
  vehiculoPlaca: 'placa',
  operador: 'operador',
  sectores: 'sectores',
};
function changes(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(FIELD)
    .filter((k) => k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => {
      const show = (v: unknown) =>
        k === 'dias' && Array.isArray(v)
          ? daysText(v as number[])
          : Array.isArray(v)
            ? v.join(', ')
            : String(v ?? '—');
      return `${FIELD[k]}: ${show(a[k])} → ${show(b[k])}`;
    });
}

export function Programacion({ user }: { user: User }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['gestion', 'programaciones'],
    queryFn: ({ signal }) =>
      management<{ items: Programa[] }>('/programaciones', 'GET', undefined, signal),
  });
  const vehicles = useQuery({
    queryKey: ['gestion', 'vehiculos'],
    queryFn: ({ signal }) =>
      management<{ items: Vehiculo[] }>('/vehiculos', 'GET', undefined, signal),
    staleTime: 300_000,
  });
  const admin = user.rol === 'administrador';
  return (
    <div className="op-programacion" data-testid="op-programacion">
      <div className="pr-section-head">
        <div>
          <h3>Programación de las rutas</h3>
          <p>
            Lo que se cambia aquí llega a la consulta del vecino, a la ruta del chofer y al tablero.
            {admin ? '' : ' Solo administración puede cambiarla.'}
          </p>
        </div>
      </div>
      {query.isPending && <div className="pr-skeleton" style={{ height: 240 }} />}
      <ul className="op-prog-lista">
        {query.data?.items.map((p) => (
          <li key={p.id} style={{ borderLeftColor: p.color }}>
            <div className="op-prog-cabeza">
              <div>
                <strong>{shortName(p.nombre)}</strong>
                <span>
                  {SERVICIO_NOMBRE[p.servicio]} · {daysText(p.dias)} · {p.horaInicio}–{p.horaFin}
                </span>
                <span>
                  {p.vehiculo} · {p.operador}
                  {p.sectores.length ? ` · ${p.sectores.join(', ')}` : ''} · {p.puntos} puntos de
                  control
                </span>
              </div>
              {admin && editing !== p.id && (
                <Button size="sm" variant="outline" onClick={() => setEditing(p.id)}>
                  Cambiar
                </Button>
              )}
            </div>
            {editing === p.id && (
              <ChangeForm
                program={p}
                vehicles={vehicles.data?.items ?? []}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  void client.invalidateQueries({ queryKey: ['gestion', 'programaciones'] });
                  void client.invalidateQueries({ queryKey: ['gestion', 'avisos'] });
                }}
              />
            )}
            {p.cambios.length > 0 && (
              <details className="op-prog-historial">
                <summary>Historial de cambios ({p.cambios.length})</summary>
                <ul>
                  {p.cambios.map((c) => (
                    <li key={c.id}>
                      <strong>Desde {showDay(c.desde)}</strong> ·{' '}
                      {changes(c.anterior, c.nuevo).join(' · ')}
                      <br />
                      <small>
                        {c.motivo} {c.usuario ? `· ${c.usuario.split(' · ')[0]}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeForm({
  program,
  vehicles,
  onCancel,
  onSaved,
}: {
  program: Programa;
  vehicles: Vehiculo[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [dias, setDias] = useState<number[]>(program.dias);
  const [inicio, setInicio] = useState(program.horaInicio);
  const [fin, setFin] = useState(program.horaFin);
  const [placa, setPlaca] = useState(program.vehiculoPlaca ?? '');
  const [notify, setNotify] = useState(true);
  const save = useMutation({
    mutationFn: (body: unknown) => management(`/programaciones/${program.id}`, 'PUT', body),
    onSuccess: onSaved,
  });
  const short = shortName(program.nombre);
  const scheduleChanged =
    JSON.stringify([...dias].sort()) !== JSON.stringify([...program.dias].sort()) ||
    inicio !== program.horaInicio ||
    fin !== program.horaFin;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const vehicle = vehicles.find((v) => v.placa === placa);
    const desde = String(form.get('desde'));
    save.mutate({
      dias: [...dias].sort((a, b) => a - b),
      horaInicio: inicio,
      horaFin: fin,
      vehiculo: vehicle?.descripcion ?? program.vehiculo,
      vehiculoPlaca: placa || null,
      operador: String(form.get('operador')).trim(),
      sectores: String(form.get('sectores'))
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
      motivo: String(form.get('motivo')).trim(),
      desde,
      aviso:
        notify && scheduleChanged
          ? {
              titulo: `Nuevo horario: ${short}`.slice(0, 120),
              mensaje: `Desde el ${showDay(desde)}, ${short} pasa los ${daysText(dias)} de ${inicio} a ${fin}.`,
            }
          : null,
    });
  }
  return (
    <form className="op-form op-prog-form" onSubmit={submit} data-testid="op-prog-form">
      <fieldset className="op-checks is-dias">
        <legend>Días</legend>
        {DIAS.map((d, i) => (
          <label key={d}>
            <input
              type="checkbox"
              checked={dias.includes(i + 1)}
              onChange={(event) =>
                setDias((s) =>
                  event.target.checked ? [...s, i + 1] : s.filter((x) => x !== i + 1),
                )
              }
            />
            {d}
          </label>
        ))}
      </fieldset>
      <div className="op-form-grid">
        <label>
          Inicio
          <input
            className="pr-field"
            type="time"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            required
          />
        </label>
        <label>
          Fin
          <input
            className="pr-field"
            type="time"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            required
          />
        </label>
        <label>
          Vehículo
          <select className="pr-field" value={placa} onChange={(e) => setPlaca(e.target.value)}>
            <option value="">{program.vehiculo}</option>
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
          Rige desde
          <input
            className="pr-field"
            type="date"
            name="desde"
            defaultValue={limaToday()}
            required
          />
        </label>
      </div>
      <label>
        Operador
        <input
          className="pr-field"
          name="operador"
          defaultValue={program.operador}
          maxLength={120}
        />
      </label>
      <label>
        Sectores (separados por comas)
        <input className="pr-field" name="sectores" defaultValue={program.sectores.join(', ')} />
      </label>
      <label>
        Motivo del cambio
        <input className="pr-field" name="motivo" required minLength={5} maxLength={300} />
      </label>
      {scheduleChanged && (
        <label className="op-check-linea">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Publicar el aviso del nuevo horario para los vecinos (tres semanas)
        </label>
      )}
      {save.isError && (
        <p role="alert" className="pr-error">
          {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
        </p>
      )}
      <div className="pr-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending || !dias.length}>
          Guardar cambio
        </Button>
      </div>
    </form>
  );
}
