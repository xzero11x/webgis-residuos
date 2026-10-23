import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Polygon } from 'geojson';
import { LoaderCircle, Plus, Save, Trash2, VectorSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Catalogos, PredioInput } from './types';

const schema = z.object({
  codigo: z
    .string()
    .trim()
    .min(3, 'Mínimo 3 caracteres.')
    .max(40)
    .regex(/^[a-zA-Z0-9-]+$/, 'Usa letras, números y guiones.'),
  direccion: z.string().trim().min(3, 'Ingresa una dirección.').max(200),
  sectorId: z.uuid('Selecciona un sector.'),
  observaciones: z.string().max(1000),
  geometry: z.custom<Polygon>(),
  personas: z
    .array(
      z.object({
        nombre: z.string().trim().min(2, 'Ingresa el nombre.').max(120),
        vinculo: z.enum(['Propietario', 'Ocupante', 'Responsable', 'Contribuyente', 'Otro']),
      }),
    )
    .max(10),
  servicios: z.array(z.object({ servicioId: z.uuid(), rutaId: z.uuid().nullable() })).max(10),
});

export function PredioEditor({
  initial,
  catalogos,
  editing,
  saving,
  error,
  onCancel,
  onSave,
  onRedraw,
}: {
  initial: PredioInput;
  catalogos: Catalogos;
  editing: boolean;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (data: PredioInput) => void;
  onRedraw: (data: PredioInput) => void;
}) {
  const form = useForm<PredioInput>({
    resolver: zodResolver(schema),
    defaultValues: initial,
    mode: 'onBlur',
  });
  const people = useFieldArray({ control: form.control, name: 'personas' });
  const assignments = useWatch({ control: form.control, name: 'servicios' });
  const { errors } = form.formState;
  return (
    <section
      className="detail-panel editor-panel"
      aria-label={editing ? 'Editar predio' : 'Crear predio'}
    >
      <div className="panel-heading">
        <div>
          <span className="demo-tag">DEMO</span>
          <h2>{editing ? 'Editar predio' : 'Nuevo predio'}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cancelar edición"
          disabled={saving}
          onClick={onCancel}
        >
          <X />
        </Button>
      </div>
      <form onSubmit={form.handleSubmit(onSave)} className="editor-form">
        <div className="panel-scroll space-y-5">
          <p className="text-xs leading-5 text-muted-foreground">
            Información de prueba. Puedes cambiarla cuando se valide con la Municipalidad.
          </p>
          <div className="field">
            <label htmlFor="predio-codigo">Código del predio</label>
            <Input
              id="predio-codigo"
              autoFocus
              {...form.register('codigo')}
              aria-invalid={!!errors.codigo}
              placeholder="DEMO-025"
            />
            <span className="field-error">{errors.codigo?.message}</span>
          </div>
          <div className="field">
            <label htmlFor="predio-direccion">Dirección</label>
            <Input
              id="predio-direccion"
              {...form.register('direccion')}
              aria-invalid={!!errors.direccion}
              placeholder="Dirección de prueba"
            />
            <span className="field-error">{errors.direccion?.message}</span>
          </div>
          <div className="field">
            <label htmlFor="predio-sector">Sector</label>
            <select
              id="predio-sector"
              {...form.register('sectorId')}
              aria-invalid={!!errors.sectorId}
            >
              <option value="">Seleccionar sector</option>
              {catalogos.sectores.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.nombre}
                </option>
              ))}
            </select>
            <span className="field-error">{errors.sectorId?.message}</span>
          </div>
          <div className="geometry-summary">
            <VectorSquare className="size-4" />
            <span>Polígono de {initial.geometry.coordinates[0]!.length - 1} vértices</span>
            <button type="button" disabled={saving} onClick={() => onRedraw(form.getValues())}>
              Redibujar
            </button>
          </div>
          <details className="form-section" open>
            <summary>
              Personas vinculadas <span>{people.fields.length}</span>
            </summary>
            <p className="my-3 text-[11px] leading-5 text-muted-foreground">
              El vínculo se registra por separado. Contribuyente no implica propietario.
            </p>
            {people.fields.map((field, index) => (
              <div className="person-fields" key={field.id}>
                <div className="field">
                  <label htmlFor={`persona-${index}`}>Nombre de persona {index + 1}</label>
                  <Input id={`persona-${index}`} {...form.register(`personas.${index}.nombre`)} />
                  <span className="field-error">{errors.personas?.[index]?.nombre?.message}</span>
                </div>
                <div className="flex items-end gap-2">
                  <div className="field flex-1">
                    <label htmlFor={`vinculo-${index}`}>Vínculo</label>
                    <select id={`vinculo-${index}`} {...form.register(`personas.${index}.vinculo`)}>
                      {['Propietario', 'Ocupante', 'Responsable', 'Contribuyente', 'Otro'].map(
                        (item) => (
                          <option key={item}>{item}</option>
                        ),
                      )}
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar persona ${index + 1}`}
                    onClick={() => people.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={people.fields.length >= 10}
              onClick={() => people.append({ nombre: '', vinculo: 'Responsable' })}
            >
              <Plus />
              Añadir persona
            </Button>
          </details>
          <details className="form-section" open>
            <summary>
              Servicios y rutas <span>{assignments.length}</span>
            </summary>
            <div className="mt-3 space-y-3">
              {catalogos.servicios.map((servicio) => {
                const index = assignments.findIndex((item) => item.servicioId === servicio.id);
                const assigned = assignments[index];
                return (
                  <div className="service-option" key={servicio.id}>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={index >= 0}
                        onChange={(event) =>
                          form.setValue(
                            'servicios',
                            event.target.checked
                              ? [...assignments, { servicioId: servicio.id, rutaId: null }]
                              : assignments.filter((item) => item.servicioId !== servicio.id),
                            { shouldDirty: true },
                          )
                        }
                      />
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: servicio.color }}
                      />
                      {servicio.nombre}
                    </label>
                    {assigned && (
                      <div className="field mt-3">
                        <label htmlFor={`ruta-${servicio.id}`}>
                          Ruta de {servicio.nombre.toLowerCase()}
                        </label>
                        <select
                          id={`ruta-${servicio.id}`}
                          value={assigned.rutaId || ''}
                          onChange={(event) =>
                            form.setValue(`servicios.${index}.rutaId`, event.target.value || null, {
                              shouldDirty: true,
                            })
                          }
                        >
                          <option value="">Sin ruta asignada</option>
                          {catalogos.rutas
                            .filter((ruta) => ruta.servicioId === servicio.id)
                            .map((ruta) => (
                              <option key={ruta.id} value={ruta.id}>
                                {ruta.codigo} · {ruta.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
          <details className="form-section">
            <summary>Observaciones</summary>
            <div className="field mt-3">
              <label className="sr-only" htmlFor="predio-observaciones">
                Observaciones
              </label>
              <textarea id="predio-observaciones" rows={3} {...form.register('observaciones')} />
              <span className="field-error">{errors.observaciones?.message}</span>
            </div>
          </details>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="panel-actions">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? 'Guardando…' : 'Guardar predio'}
          </Button>
        </footer>
      </form>
    </section>
  );
}
