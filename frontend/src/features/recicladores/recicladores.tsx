import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Receipt, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management, showDay, type User } from '@/features/gestion/api';
import '@/features/operacion/supervisor.css';
import './recicladores.css';

// Recicladores y valorización: la organización formalizada con su registro municipal vigente (Ley
// 29419), sus socios con carnet, capacitación, vacunas y equipo de protección, y los comprobantes
// de lo que se valorizó, sin los cuales el material no cuenta en el reporte.

interface Actor {
  id: string;
  nombre: string;
  tipo: 'asociacion_recicladores' | 'eo_rs' | 'planta_municipal';
  registro: string;
  ruc: string | null;
  registroNumero: string | null;
  registroDesde: string | null;
  registroHasta: string | null;
  representante: string | null;
  zona: string | null;
  diasVigencia: number | null;
  activos: number;
  capacitados: number;
  vacunados: number;
  conEpp: number;
  conCarnet: number;
  toneladasAnio: number;
  vigente: boolean;
}
interface Socio {
  id: string;
  nombre: string;
  documento: string | null;
  carnet: string | null;
  desde: string;
  hasta: string | null;
  capacitado: boolean;
  vacunado: boolean;
  epp: boolean;
}
interface Comprobante {
  id: string;
  actor: string;
  periodo: string;
  fecha: string;
  material: string;
  toneladas: number;
  comprobanteTipo: string;
  comprobanteNumero: string;
  anulada: boolean;
}
const TIPO: Record<Actor['tipo'], string> = {
  asociacion_recicladores: 'Asociación de recicladores',
  eo_rs: 'Empresa operadora (EO-RS)',
  planta_municipal: 'Planta municipal',
};
const COMPROBANTE: Record<string, string> = {
  factura: 'Factura',
  boleta: 'Boleta',
  liquidacion_compra: 'Liquidación de compra',
  registro_planta: 'Registro de planta',
};
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

function vigencia(a: Actor) {
  if (a.tipo !== 'asociacion_recicladores') return null;
  if (!a.registroHasta) return { texto: 'Sin registro municipal', tono: 'is-danger' };
  if ((a.diasVigencia ?? 0) < 0)
    return { texto: `Registro vencido el ${showDay(a.registroHasta)}`, tono: 'is-danger' };
  if ((a.diasVigencia ?? 0) <= 60)
    return {
      texto: `Registro vence en ${a.diasVigencia} días (${showDay(a.registroHasta)})`,
      tono: 'is-warn',
    };
  return { texto: `Registro vigente hasta ${showDay(a.registroHasta)}`, tono: 'is-info' };
}

export function Recicladores({ user }: { user: User }) {
  const client = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [voucher, setVoucher] = useState(false);
  const actors = useQuery({
    queryKey: ['gestion', 'recicladores-actores'],
    queryFn: ({ signal }) =>
      management<{ items: Actor[] }>('/recicladores/actores', 'GET', undefined, signal),
  });
  const vouchers = useQuery({
    queryKey: ['gestion', 'valorizacion-lista'],
    queryFn: ({ signal }) =>
      management<{ items: Comprobante[] }>('/valorizacion', 'GET', undefined, signal),
  });
  const canWrite = user.rol !== 'consulta';
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['gestion', 'recicladores-actores'] });
    void client.invalidateQueries({ queryKey: ['gestion', 'valorizacion-lista'] });
  };
  return (
    <div className="rc" data-testid="recicladores">
      <div className="pr-section-head">
        <div>
          <h2>Recicladores y valorización</h2>
          <p>
            Organizaciones con las que se valoriza, su formalización (Ley 29419) y los comprobantes
            del material entregado. Sin comprobante, el material no cuenta como valorizado.
          </p>
        </div>
        {canWrite && !voucher && (
          <Button onClick={() => setVoucher(true)} data-testid="rc-comprobante">
            <Receipt size={14} aria-hidden="true" /> Registrar comprobante
          </Button>
        )}
      </div>
      {voucher && (
        <VoucherForm
          actors={(actors.data?.items ?? []).filter((a) => a.vigente)}
          onCancel={() => setVoucher(false)}
          onSaved={() => {
            setVoucher(false);
            refresh();
          }}
        />
      )}
      <ul className="rc-actores">
        {actors.data?.items.map((a) => {
          const v = vigencia(a);
          return (
            <li key={a.id}>
              <div className="rc-cabeza">
                <div>
                  <strong>{a.nombre}</strong>
                  <span>
                    {TIPO[a.tipo]}
                    {a.ruc ? ` · RUC ${a.ruc}` : ''}
                    {a.representante ? ` · ${a.representante}` : ''}
                  </span>
                  <span>
                    {a.toneladasAnio.toLocaleString('es-PE', { maximumFractionDigits: 1 })} t
                    valorizadas en los últimos 12 meses
                    {a.zona ? ` · ${a.zona}` : ''}
                  </span>
                </div>
                {v && <span className={`pr-chip ${v.tono}`}>{v.texto}</span>}
              </div>
              {a.tipo === 'asociacion_recicladores' && (
                <>
                  <div className="rc-socios-resumen">
                    <span>
                      <strong>{a.activos}</strong> socios
                    </span>
                    <span>
                      <strong>{pct(a.conCarnet, a.activos)} %</strong> con carnet
                    </span>
                    <span>
                      <strong>{pct(a.capacitados, a.activos)} %</strong> capacitados
                    </span>
                    <span>
                      <strong>{pct(a.vacunados, a.activos)} %</strong> vacunados
                    </span>
                    <span>
                      <strong>{pct(a.conEpp, a.activos)} %</strong> con equipo de protección
                    </span>
                  </div>
                  {a.registroNumero && (
                    <p className="op-nota">Registro municipal {a.registroNumero}</p>
                  )}
                  {user.rol !== 'consulta' && (
                    <button
                      type="button"
                      className="pr-link-button"
                      onClick={() => setOpen(open === a.id ? null : a.id)}
                      aria-expanded={open === a.id}
                    >
                      {open === a.id ? 'Ocultar socios' : 'Ver socios'}
                    </button>
                  )}
                  {open === a.id && <Members actor={a} canWrite={canWrite} onChanged={refresh} />}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <section>
        <h3 className="op-subtitulo">Comprobantes recientes</h3>
        <div className="op-tabla-scroll">
          <table className="op-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Actor</th>
                <th>Material</th>
                <th>Toneladas</th>
                <th>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.data?.items.slice(0, 40).map((c) => (
                <tr key={c.id} className={c.anulada ? 'is-falta' : ''}>
                  <td>{showDay(c.fecha)}</td>
                  <td>{c.actor}</td>
                  <td>{c.material}</td>
                  <td>{c.toneladas.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</td>
                  <td>
                    {COMPROBANTE[c.comprobanteTipo] ?? c.comprobanteTipo} {c.comprobanteNumero}
                    {c.anulada ? ' · anulado' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Members({
  actor,
  canWrite,
  onChanged,
}: {
  actor: Actor;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const key = ['gestion', 'socios', actor.id];
  const members = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      management<{ items: Socio[] }>(
        `/recicladores/actores/${actor.id}/socios`,
        'GET',
        undefined,
        signal,
      ),
  });
  const update = useMutation({
    mutationFn: (s: Socio) =>
      management(`/recicladores/socios/${s.id}`, 'PUT', {
        carnet: s.carnet,
        capacitado: s.capacitado,
        vacunado: s.vacunado,
        epp: s.epp,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      onChanged();
    },
  });
  const add = useMutation({
    mutationFn: (body: unknown) =>
      management(`/recicladores/actores/${actor.id}/socios`, 'POST', body),
    onSuccess: () => {
      setAdding(false);
      void client.invalidateQueries({ queryKey: key });
      onChanged();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    add.mutate({
      nombre: String(f.get('nombre')).trim(),
      documento: String(f.get('documento') ?? '').trim() || null,
      carnet: String(f.get('carnet') ?? '').trim() || null,
      desde: String(f.get('desde')),
      capacitado: f.get('capacitado') === 'on',
      vacunado: f.get('vacunado') === 'on',
      epp: f.get('epp') === 'on',
    });
  }
  const active = (members.data?.items ?? []).filter((m) => !m.hasta);
  return (
    <div className="rc-socios">
      <table className="op-tabla">
        <thead>
          <tr>
            <th>Socio</th>
            <th>Carnet</th>
            <th>Desde</th>
            <th>Capacitado</th>
            <th>Vacunado</th>
            <th>EPP</th>
          </tr>
        </thead>
        <tbody>
          {active.map((m) => (
            <tr key={m.id}>
              <td>
                {m.nombre}
                {m.documento ? <small> · DNI {m.documento}</small> : null}
              </td>
              <td>{m.carnet ?? '—'}</td>
              <td>{showDay(m.desde)}</td>
              {(['capacitado', 'vacunado', 'epp'] as const).map((flag) => (
                <td key={flag}>
                  <input
                    type="checkbox"
                    checked={m[flag]}
                    disabled={!canWrite || update.isPending}
                    aria-label={`${flag} · ${m.nombre}`}
                    onChange={(event) => update.mutate({ ...m, [flag]: event.target.checked })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite &&
        (adding ? (
          <form className="op-form" onSubmit={submit}>
            <div className="op-form-grid">
              <label>
                Nombre y apellidos
                <input className="pr-field" name="nombre" required minLength={5} maxLength={160} />
              </label>
              <label>
                DNI
                <input
                  className="pr-field"
                  name="documento"
                  inputMode="numeric"
                  pattern="[0-9]{8}"
                  maxLength={8}
                />
              </label>
              <label>
                N.° de carnet
                <input className="pr-field" name="carnet" maxLength={40} />
              </label>
              <label>
                Socio desde
                <input
                  className="pr-field"
                  type="date"
                  name="desde"
                  defaultValue={today()}
                  required
                />
              </label>
            </div>
            <div className="op-checks">
              <label>
                <input type="checkbox" name="capacitado" /> Capacitado
              </label>
              <label>
                <input type="checkbox" name="vacunado" /> Vacunado
              </label>
              <label>
                <input type="checkbox" name="epp" /> Tiene equipo de protección
              </label>
            </div>
            {add.isError && (
              <p role="alert" className="pr-error">
                {add.error instanceof Error ? add.error.message : 'No se pudo registrar.'}
              </p>
            )}
            <div className="pr-actions">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={add.isPending}>
                Registrar socio
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus size={14} aria-hidden="true" /> Agregar socio
          </Button>
        ))}
    </div>
  );
}

function VoucherForm({
  actors,
  onCancel,
  onSaved,
}: {
  actors: Actor[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const materials = useQuery({
    queryKey: ['gestion', 'materiales-activos'],
    queryFn: ({ signal }) =>
      management<{ items: { codigo: string; nombre: string }[] }>(
        '/materiales-activos',
        'GET',
        undefined,
        signal,
      ),
  });
  const save = useMutation({
    mutationFn: (body: unknown) => management('/valorizacion', 'POST', body),
    onSuccess: onSaved,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    save.mutate({
      actorId: String(f.get('actor')),
      fecha: String(f.get('fecha')),
      material: String(f.get('material')),
      toneladas: Number(f.get('toneladas')),
      comprobanteTipo: String(f.get('tipo')),
      comprobanteNumero: String(f.get('numero')).trim(),
      observaciones: String(f.get('obs') ?? '').trim(),
    });
  }
  return (
    <form
      className="pr-card pr-card-pad op-form"
      onSubmit={submit}
      data-testid="rc-comprobante-form"
    >
      <h3>
        <BadgeCheck size={15} aria-hidden="true" /> Comprobante de valorización
      </h3>
      <div className="op-form-grid">
        <label>
          Actor
          <select className="pr-field" name="actor" required>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            className="pr-field"
            type="date"
            name="fecha"
            defaultValue={today()}
            max={today()}
            required
          />
        </label>
        <label>
          Material
          <select className="pr-field" name="material" required>
            {materials.data?.items.map((m) => (
              <option key={m.codigo} value={m.nombre}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Toneladas
          <input
            className="pr-field"
            type="number"
            name="toneladas"
            step="0.001"
            min="0.001"
            max="500"
            required
          />
        </label>
        <label>
          Tipo de comprobante
          <select className="pr-field" name="tipo" required>
            {Object.entries(COMPROBANTE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Número
          <input
            className="pr-field"
            name="numero"
            required
            minLength={3}
            maxLength={40}
            placeholder="E001-000123"
          />
        </label>
      </div>
      <label>
        Observaciones
        <input className="pr-field" name="obs" maxLength={300} />
      </label>
      {save.isError && (
        <p role="alert" className="pr-error">
          {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
        </p>
      )}
      <div className="pr-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Guardar comprobante
        </Button>
      </div>
    </form>
  );
}
