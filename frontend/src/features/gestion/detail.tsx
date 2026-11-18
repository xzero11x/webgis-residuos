import { Units } from './units';
import { DeliveryCorrection } from './delivery-correction';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, localDay, showDay, type Detail, type Person, type User } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';
import { PredioArchive } from './predio-archive';
import { historyLabels } from './labels';

type Save = (path: string, data: unknown) => Promise<unknown>;
function PeriodFields() {
  return (
    <>
      <label>
        Desde
        <input name="desde" type="date" defaultValue={localDay()} required />
      </label>
      <label>
        Hasta (opcional)
        <input name="hasta" type="date" />
      </label>
      <label>
        Fuente o evidencia de prueba
        <input
          name="evidencia"
          required
          maxLength={1000}
          defaultValue="Ensayo sintético; sin validación institucional"
        />
      </label>
    </>
  );
}
function period(f: FormData) {
  return { desde: f.get('desde'), hasta: f.get('hasta') || null, evidencia: f.get('evidencia') };
}
export function PredioDetail({
  data,
  user,
  onEdit,
  save,
  pending,
  startDelivery = false,
}: {
  data: Detail;
  user: User;
  onEdit: () => void;
  save: Save;
  pending: boolean;
  startDelivery?: boolean;
}) {
  const edits = useWorkspaceEdits();
  const [params] = useSearchParams();
  const requestedUnit = params.get('unidad');
  const mapParams = new URLSearchParams(params);
  ['trabajo', 'vista', 'accion', 'volver', 'registro', 'ampliar'].forEach((key) =>
    mapParams.delete(key),
  );
  mapParams.set('predio', data.predio.id);
  const [closing, setClosing] = useState<{ kind: string; id: string } | null>(null);
  const [tab, setTab] = useState(
      startDelivery ? 'Entregas' : params.get('unidad') ? 'Unidades' : 'Resumen',
    ),
    [adding, setAdding] = useState(
      startDelivery &&
        user.rol !== 'consulta' &&
        !data.predio.archivado &&
        data.participaciones.length > 0,
    ),
    [error, setError] = useState('');
  const p = data.predio,
    editable = user.rol !== 'consulta' && !p.archivado;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!requestedUnit) heading.current?.focus();
  }, [p.id, requestedUnit]);
  const catalog = useQuery({
    queryKey: ['gestion', 'catalogos'],
    queryFn: () =>
      management<{ servicios: { id: string; nombre: string; activo: boolean }[] }>('/catalogos'),
  });
  const people = useQuery({
    queryKey: ['gestion', 'personas'],
    queryFn: () => management<{ items: Person[] }>('/personas'),
    enabled: tab === 'Personas' && editable,
  });
  const materials = useQuery({
    queryKey: ['gestion', 'materiales'],
    queryFn: () => management<{ items: { id: string; nombre: string }[] }>('/catalogos/materiales'),
    enabled: tab === 'Entregas' && editable,
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      f = new FormData(form);
    setError('');
    try {
      if (tab === 'Personas') {
        await save(`/predios/${p.id}/vinculos`, {
          ...(newPerson
            ? {
                persona: {
                  codigo: f.get('codigo'),
                  nombre: f.get('nombre'),
                  tipo: f.get('tipoPersona'),
                },
              }
            : { personaId: String(f.get('personaId') || '') }),
          tipo: f.get('tipo'),
          periodo: period(f),
        });
      } else if (tab === 'Servicios') {
        await save(`/predios/${p.id}/asignaciones`, {
          servicioId: f.get('servicioId'),
          estado: f.get('estado'),
          periodo: period(f),
        });
      } else if (tab === 'Entregas' && f.get('accion') === 'participacion') {
        await save(`/predios/${p.id}/participaciones`, {
          servicioId: f.get('servicioId'),
          periodo: period(f),
        });
      } else if (tab === 'Entregas') {
        const key = form.dataset.key || (form.dataset.key = crypto.randomUUID());
        await save('/entregas', {
          participacionId: f.get('participacionId'),
          fecha: f.get('fecha'),
          material: f.get('material'),
          cantidad: f.get('cantidad') ? Number(f.get('cantidad')) : null,
          unidad: f.get('unidad') || null,
          observaciones: f.get('observaciones'),
          clave: key,
        });
      }
      setAdding(false);
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }
  const [newPerson, setNewPerson] = useState(false),
    [participation, setParticipation] = useState(false),
    [voidId, setVoidId] = useState('');
  const services = (
    <label>
      Servicio de prueba
      <select name="servicioId" aria-label="Servicio de prueba" required defaultValue="">
        <option value="" disabled>
          Selecciona un servicio
        </option>
        {catalog.data?.servicios
          .filter((s) => s.activo)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <article className="gm-detail" aria-label="Ficha administrativa del predio">
      <div className="gm-detail-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {p.codigo}
          </h2>
          <p>{p.direccion}</p>
        </div>
        {editable && (
          <Button variant="outline" onClick={() => edits.run(onEdit)}>
            Editar predio
          </Button>
        )}
      </div>
      <div className="gm-inline-meta">
        {p.archivado && <strong>Archivado · {p.motivo_archivo}</strong>}
        <span>Datos sintéticos</span>
        <span>Ubicación {p.estado_ubicacion}</span>
      </div>
      {user.rol === 'administrador' && <PredioArchive predio={p} />}
      <div className="gm-tabs" role="tablist" aria-label="Secciones del predio">
        {['Resumen', 'Personas', 'Servicios', 'Entregas', 'Historial', 'Unidades'].map((name) => (
          <button
            key={name}
            role="tab"
            id={`gm-tab-${name}`}
            aria-controls="gm-tab-panel"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const names = [
                  'Resumen',
                  'Personas',
                  'Servicios',
                  'Entregas',
                  'Historial',
                  'Unidades',
                ];
                const next =
                  names[
                    (names.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : names.length - 1)) %
                      names.length
                  ]!;
                edits.run(() => {
                  setTab(next);
                  setAdding(false);
                  document.getElementById(`gm-tab-${next}`)?.focus();
                });
              }
            }}
            onClick={() =>
              edits.run(() => {
                setTab(name);
                setAdding(false);
                setError('');
              })
            }
          >
            {name}
          </button>
        ))}
      </div>
      <section
        id="gm-tab-panel"
        role="tabpanel"
        aria-labelledby={`gm-tab-${tab}`}
        className="gm-tab-content"
      >
        {error && (
          <p role="alert" className="gm-error">
            {error}
          </p>
        )}
        {closing && (
          <form
            data-unsaved-form
            className="gm-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save(`/predios/${p.id}/${closing.kind}/${closing.id}/cerrar`, {
                  hasta: new FormData(e.currentTarget).get('hasta'),
                });
                setClosing(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo cerrar la relación.');
              }
            }}
          >
            <h3>Cerrar relación conservando el historial</h3>
            <label>
              Fecha de fin
              <input type="date" name="hasta" required defaultValue={localDay()} />
            </label>
            <FormActions pending={pending} cancel={() => setClosing(null)} />
          </form>
        )}
        {tab === 'Unidades' && <Units id={p.id} editable={editable} />}
        {tab === 'Resumen' && (
          <>
            <dl className="gm-facts">
              <div>
                <dt>Sector</dt>
                <dd>{p.sector || 'Sin información'}</dd>
              </div>
              <div>
                <dt>Uso registrado</dt>
                <dd>{p.uso || 'Sin información'}</dd>
              </div>
              <div>
                <dt>Origen</dt>
                <dd>{p.fuente}</dd>
              </div>
              <div>
                <dt>Actualizado</dt>
                <dd>
                  {showDay(p.actualizado_en)} · versión {p.version}
                </dd>
              </div>
              <div>
                <dt>Observaciones</dt>
                <dd>{p.observaciones || 'Sin observaciones'}</dd>
              </div>
              <div>
                <dt>Ubicación</dt>
                <dd>
                  {p.ubicacion
                    ? `${p.estado_ubicacion} · ${p.evidencia_ubicacion}`
                    : 'Pendiente. La ficha existe aunque todavía no haya coordenadas.'}
                </dd>
              </div>
            </dl>
            {p.ubicacion && (
              <Link className="gm-link" to={`/bagua-master?${mapParams}`}>
                Ver referencia del predio en el mapa
              </Link>
            )}
          </>
        )}
        {tab === 'Personas' && (
          <>
            <p className="gm-muted">
              Un vínculo no acredita propiedad legal ni implica participación en el servicio.
            </p>
            {!data.personasPermitidas ? (
              <p>Tu perfil no tiene acceso a personas vinculadas.</p>
            ) : (
              <>
                {data.personas.length === 0 ? (
                  <p>No hay personas vinculadas.</p>
                ) : (
                  <ul className="gm-records">
                    {data.personas.map((v) => (
                      <li key={v.id}>
                        <strong>{v.nombre}</strong>
                        <span>
                          {v.codigo} · {v.tipo.replaceAll('_', ' ')} · {showDay(v.desde)}
                          {v.hasta ? ` a ${showDay(v.hasta)}` : ''}
                        </span>
                        <small>{v.evidencia}</small>
                        {editable && !v.hasta && (
                          <button
                            className="gm-link"
                            onClick={() => setClosing({ kind: 'vinculos', id: v.id })}
                          >
                            Cerrar vínculo
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {editable && !adding && (
                  <Button variant="outline" onClick={() => setAdding(true)}>
                    Vincular persona
                  </Button>
                )}
              </>
            )}
            {adding && (
              <form data-unsaved-form onSubmit={submit} className="gm-form">
                <h3>Vincular persona sintética</h3>
                <label className="gm-check">
                  <input
                    type="checkbox"
                    checked={newPerson}
                    onChange={(e) => setNewPerson(e.target.checked)}
                  />
                  Crear una persona de prueba
                </label>
                {newPerson ? (
                  <>
                    <label>
                      Código de persona
                      <input name="codigo" required maxLength={60} />
                    </label>
                    <label>
                      Nombre sintético
                      <input name="nombre" required maxLength={160} />
                    </label>
                    <label>
                      Tipo de persona
                      <select name="tipoPersona">
                        <option value="natural">Natural</option>
                        <option value="juridica">Jurídica</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <label>
                    Persona existente
                    <select
                      name="personaId"
                      aria-label="Persona existente"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Selecciona una persona
                      </option>
                      {people.data?.items.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.codigo} · {v.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Tipo de vínculo
                  <select name="tipo">
                    <option value="contribuyente">Contribuyente</option>
                    <option value="ocupante">Ocupante</option>
                    <option value="propietario_declarado">Propietario declarado</option>
                    <option value="responsable">Responsable</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <PeriodFields />
                <FormActions pending={pending} cancel={() => setAdding(false)} />
              </form>
            )}
          </>
        )}
        {tab === 'Servicios' && (
          <>
            <p className="gm-muted">
              La asignación no demuestra que el recojo se haya realizado. Catálogo sintético,
              pendiente de validación.
            </p>
            {!data.asignaciones.length ? (
              <p>Sin asignaciones registradas.</p>
            ) : (
              <ul className="gm-records">
                {data.asignaciones.map((v) => (
                  <li key={v.id}>
                    <strong>{v.nombre}</strong>
                    <span>
                      {v.estado} · desde {showDay(v.desde)}
                      {v.hasta ? ` hasta ${showDay(v.hasta)}` : ''}
                    </span>
                    <small>{v.evidencia}</small>
                    {editable && !v.hasta && (
                      <button
                        className="gm-link"
                        onClick={() => setClosing({ kind: 'asignaciones', id: v.id })}
                      >
                        Cerrar asignación
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editable && !adding && (
              <Button variant="outline" onClick={() => setAdding(true)}>
                Asignar servicio
              </Button>
            )}
            {adding && (
              <form data-unsaved-form onSubmit={submit} className="gm-form">
                <h3>Asignación de prueba</h3>
                {services}
                <label>
                  Estado de asignación
                  <select name="estado">
                    <option value="pendiente">Pendiente</option>
                    <option value="prevista">Prevista</option>
                    <option value="confirmada">Confirmada · solo ensayo</option>
                  </select>
                </label>
                <PeriodFields />
                <FormActions pending={pending} cancel={() => setAdding(false)} />
              </form>
            )}
          </>
        )}
        {tab === 'Entregas' && (
          <>
            <p className="gm-muted">
              Participar en un programa y registrar una entrega son hechos distintos. La cantidad
              queda sin información si no se midió.
            </p>
            <h3>Participaciones registradas</h3>
            {!data.participaciones.length ? (
              <p>Sin participaciones registradas.</p>
            ) : (
              <ul className="gm-records">
                {data.participaciones.map((v) => (
                  <li key={v.id}>
                    <strong>{v.nombre}</strong>
                    <span>
                      Desde {showDay(v.desde)}
                      {v.hasta ? ` hasta ${showDay(v.hasta)}` : ''}
                    </span>
                    <small>{v.evidencia}</small>
                    {editable && !v.hasta && (
                      <button
                        className="gm-link"
                        onClick={() => setClosing({ kind: 'participaciones', id: v.id })}
                      >
                        Cerrar participación
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editable && !adding && (
              <div className="gm-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAdding(true);
                    setParticipation(true);
                  }}
                >
                  Registrar participación
                </Button>
                <Button
                  disabled={!data.participaciones.length}
                  onClick={() => {
                    setAdding(true);
                    setParticipation(false);
                  }}
                >
                  Registrar entrega
                </Button>
              </div>
            )}
            {adding && (
              <form data-unsaved-form onSubmit={submit} className="gm-form">
                <h3>{participation ? 'Nueva participación' : 'Nueva entrega sintética'}</h3>
                <input
                  type="hidden"
                  name="accion"
                  value={participation ? 'participacion' : 'entrega'}
                />
                {participation ? (
                  <>
                    {services}
                    <PeriodFields />
                  </>
                ) : (
                  <>
                    <label>
                      Participación
                      <select
                        name="participacionId"
                        aria-label="Participación"
                        required
                        defaultValue={
                          data.participaciones.length === 1 ? data.participaciones[0]!.id : ''
                        }
                      >
                        <option value="" disabled>
                          Selecciona participación
                        </option>
                        {data.participaciones.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nombre} · {showDay(v.desde)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Fecha de entrega
                      <input
                        name="fecha"
                        type="date"
                        required
                        max={localDay()}
                        defaultValue={localDay()}
                      />
                    </label>
                    <label>
                      Material registrado
                      <input
                        name="material"
                        list="gm-materiales"
                        required
                        maxLength={120}
                        placeholder="Ej. material sintético de ensayo"
                      />
                      <datalist id="gm-materiales">
                        {materials.data?.items.map((material) => (
                          <option key={material.id} value={material.nombre} />
                        ))}
                      </datalist>
                    </label>
                    <div className="gm-fields">
                      <label>
                        Cantidad (si se midió)
                        <input name="cantidad" type="number" min="0.001" max="1000000" step="any" />
                      </label>
                      <label>
                        Unidad
                        <select name="unidad">
                          <option value="">Sin medición</option>
                          <option value="kg">kg</option>
                          <option value="unidad">unidad</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Observaciones
                      <textarea name="observaciones" maxLength={1000} />
                    </label>
                  </>
                )}
                <FormActions pending={pending} cancel={() => setAdding(false)} />
              </form>
            )}
            <h3>Historial de entregas</h3>
            {!data.entregas.length ? (
              <p>Sin entregas registradas.</p>
            ) : (
              <ul className="gm-records">
                {data.entregas.map((v) => (
                  <li key={v.id}>
                    <strong>
                      {showDay(v.fecha)} · {v.material}
                      {v.anulada ? ' · Anulada' : ''}
                    </strong>
                    <span>
                      {v.cantidad === null
                        ? 'Cantidad sin información'
                        : `${Number(v.cantidad).toLocaleString('es-PE')} ${v.unidad}`}{' '}
                      · {v.servicio}
                    </span>
                    {user.rol !== 'consulta' && (
                      <DeliveryCorrection delivery={v} editable={editable} />
                    )}
                    {v.anulada ? (
                      <small>{v.motivo_anulacion}</small>
                    ) : (
                      editable && (
                        <button className="gm-link" onClick={() => setVoidId(v.id)}>
                          Anular entrega
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
            {voidId && (
              <form
                data-unsaved-form
                className="gm-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const reason = new FormData(e.currentTarget).get('motivo');
                  try {
                    await save(`/entregas/${voidId}/anular`, {
                      motivo: reason,
                      version: data.entregas.find((v) => v.id === voidId)?.version,
                    });
                    setVoidId('');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'No se pudo anular.');
                  }
                }}
              >
                <h3>Anular conservando el historial</h3>
                <label>
                  Motivo
                  <input name="motivo" required minLength={5} maxLength={1000} />
                </label>
                <FormActions pending={pending} cancel={() => setVoidId('')} />
              </form>
            )}
          </>
        )}
        {tab === 'Historial' &&
          (!data.personasPermitidas ? (
            <p>Historial restringido para este perfil.</p>
          ) : (
            <ul className="gm-records">
              {data.historial.map((v) => (
                <li key={v.id}>
                  <strong>{historyLabels[v.accion] ?? v.accion.replaceAll('.', ' · ')}</strong>
                  <span>
                    {showDay(v.creado_en)} · {v.responsable}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </article>
  );
}
function FormActions({ pending, cancel }: { pending: boolean; cancel: () => void }) {
  const edits = useWorkspaceEdits();
  return (
    <div className="gm-actions">
      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar registro'}
      </Button>
      <Button type="button" variant="outline" onClick={() => edits.run(cancel)}>
        Cancelar
      </Button>
    </div>
  );
}
