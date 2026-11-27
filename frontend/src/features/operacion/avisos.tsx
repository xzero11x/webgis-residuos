import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, showDay, type User } from '@/features/gestion/api';
import { AVISO_TIPO, limaToday, shortName, type Aviso } from './tipos';

// Avisos del servicio: lo que se publica aquí lo ve el vecino al escanear su sticker o consultar su
// punto, el chofer en su ruta del día y el promotor en su recorrido. Una suspensión además saca ese
// día del cálculo de cumplimiento.

interface Programa {
  id: string;
  nombre: string;
  servicio: string;
}

export function Avisos({ user }: { user: User }) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [all, setAll] = useState(false);
  const query = useQuery({
    queryKey: ['gestion', 'avisos', all],
    queryFn: ({ signal }) =>
      management<{ items: Aviso[] }>(`/avisos?todos=${all ? 1 : 0}`, 'GET', undefined, signal),
  });
  const programs = useQuery({
    queryKey: ['gestion', 'programaciones'],
    queryFn: ({ signal }) =>
      management<{ items: Programa[] }>('/programaciones', 'GET', undefined, signal),
  });
  const retire = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      management(`/avisos/${id}/retirar`, 'POST', { motivo }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['gestion', 'avisos'] }),
  });
  const canWrite = user.rol !== 'consulta';
  const today = limaToday();
  const names = new Map((programs.data?.items ?? []).map((p) => [p.id, p.nombre]));
  const items = query.data?.items ?? [];
  const groups = [
    {
      title: 'Vigentes',
      rows: items.filter((a) => !a.retirado && a.desde <= today && a.hasta >= today),
    },
    { title: 'Próximos', rows: items.filter((a) => !a.retirado && a.desde > today) },
    { title: 'Anteriores o retirados', rows: items.filter((a) => a.retirado || a.hasta < today) },
  ];
  return (
    <div className="op-avisos" data-testid="op-avisos">
      <div className="pr-section-head">
        <div>
          <h3>Avisos al vecino, al chofer y al promotor</h3>
          <p>
            Se muestran en la página del sticker QR, en la consulta «¿cuándo pasa?» del mapa, en la
            ruta del chofer y en el recorrido de campo, desde una semana antes.
          </p>
        </div>
        {canWrite && !creating && <Button onClick={() => setCreating(true)}>Publicar aviso</Button>}
      </div>
      {creating && (
        <NoticeForm
          programs={programs.data?.items ?? []}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void client.invalidateQueries({ queryKey: ['gestion', 'avisos'] });
            void client.invalidateQueries({ queryKey: ['gestion', 'operacion-dia'] });
          }}
        />
      )}
      {query.isPending && <div className="pr-skeleton" style={{ height: 160 }} />}
      {groups.map(
        (g) =>
          g.rows.length > 0 && (
            <section key={g.title}>
              <h4 className="op-subtitulo">{g.title}</h4>
              <ul className="op-aviso-lista">
                {g.rows.map((a) => (
                  <li key={a.id} className={a.retirado ? 'is-retirado' : `is-${a.tipo}`}>
                    <div>
                      <span
                        className={`pr-chip ${a.tipo === 'suspension' ? 'is-warn' : 'is-info'}`}
                      >
                        {AVISO_TIPO[a.tipo]}
                      </span>{' '}
                      <strong>{a.titulo}</strong>
                      <p>{a.mensaje}</p>
                      <small>
                        {a.desde === a.hasta
                          ? showDay(a.desde)
                          : `Del ${showDay(a.desde)} al ${showDay(a.hasta)}`}{' '}
                        ·{' '}
                        {a.programaciones?.length
                          ? a.programaciones.map((p) => shortName(names.get(p)) ?? p).join(', ')
                          : 'Todo el servicio'}
                        {a.publicadoPor ? ` · ${a.publicadoPor.split(' · ')[0]}` : ''}
                        {a.retirado ? ` · retirado: ${a.motivoRetiro}` : ''}
                      </small>
                    </div>
                    {canWrite && !a.retirado && a.hasta >= today && (
                      <button
                        type="button"
                        className="pr-link-button"
                        onClick={() => {
                          const motivo = window.prompt(
                            'Motivo para retirar el aviso (mínimo 5 caracteres):',
                          );
                          if (motivo && motivo.trim().length >= 5)
                            retire.mutate({ id: a.id, motivo: motivo.trim() });
                        }}
                      >
                        Retirar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
      <button type="button" className="pr-link-button" onClick={() => setAll((v) => !v)}>
        {all ? 'Ver solo los recientes' : 'Ver todo el historial'}
      </button>
    </div>
  );
}

function NoticeForm({
  programs,
  onCancel,
  onSaved,
}: {
  programs: Programa[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Aviso['tipo']>('suspension');
  const [selected, setSelected] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: (body: unknown) => management('/avisos', 'POST', body),
    onSuccess: onSaved,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      tipo,
      titulo: String(form.get('titulo')).trim(),
      mensaje: String(form.get('mensaje')).trim(),
      programaciones: selected,
      desde: String(form.get('desde')),
      hasta: String(form.get('hasta')),
    });
  }
  return (
    <form className="pr-card pr-card-pad op-form" onSubmit={submit} data-testid="op-aviso-form">
      <div className="pr-segmented" role="group" aria-label="Tipo de aviso">
        {(['suspension', 'cambio_horario', 'informativo'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            {AVISO_TIPO[t]}
          </button>
        ))}
      </div>
      <label>
        Título
        <input
          className="pr-field"
          name="titulo"
          required
          minLength={5}
          maxLength={120}
          placeholder={tipo === 'suspension' ? 'Lunes 14: sin recolección en la Ruta 1001' : ''}
        />
      </label>
      <label>
        Mensaje para el vecino
        <textarea
          className="pr-field"
          name="mensaje"
          required
          minLength={5}
          maxLength={600}
          rows={3}
        />
      </label>
      <div className="op-form-grid">
        <label>
          Desde
          <input
            className="pr-field"
            type="date"
            name="desde"
            defaultValue={limaToday()}
            required
          />
        </label>
        <label>
          Hasta
          <input
            className="pr-field"
            type="date"
            name="hasta"
            defaultValue={limaToday()}
            required
          />
        </label>
      </div>
      <fieldset className="op-checks">
        <legend>Rutas afectadas (ninguna marcada = todo el servicio)</legend>
        {programs.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(event) =>
                setSelected((s) =>
                  event.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id),
                )
              }
            />
            {shortName(p.nombre)}
          </label>
        ))}
      </fieldset>
      {save.isError && (
        <p role="alert" className="pr-error">
          {save.error instanceof Error ? save.error.message : 'No se pudo publicar.'}
        </p>
      )}
      <div className="pr-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Publicar
        </Button>
      </div>
    </form>
  );
}
