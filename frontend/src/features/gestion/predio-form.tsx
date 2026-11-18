import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { Predio } from './api';

export function PredioForm({
  predio,
  onSave,
  onCancel,
  pending,
}: {
  predio?: Predio;
  onSave: (data: unknown) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [located, setLocated] = useState(Boolean(predio?.ubicacion));
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const longitude = Number(f.get('longitud')),
      latitude = Number(f.get('latitud'));
    if (located && (!Number.isFinite(longitude) || !Number.isFinite(latitude))) {
      setError('Revisa las coordenadas.');
      return;
    }
    onSave({
      codigo: f.get('codigo'),
      direccion: f.get('direccion'),
      sector: f.get('sector') || null,
      uso: f.get('uso') || null,
      observaciones: f.get('observaciones'),
      ubicacion: located ? { type: 'Point', coordinates: [longitude, latitude] } : null,
      estadoUbicacion: located ? f.get('estadoUbicacion') : 'pendiente',
      evidenciaUbicacion: located ? f.get('evidenciaUbicacion') : '',
    });
  }
  return (
    <form data-unsaved-form onSubmit={submit} onInput={() => setDirty(true)} className="gm-form">
      <h2>{predio ? 'Editar predio' : 'Nuevo predio sintético'}</h2>
      <p className="gm-muted">
        La ficha puede guardarse sin ubicación. Usa exclusivamente información ficticia en este
        entorno.
      </p>
      <div className="gm-fields">
        <label>
          Código de origen
          <input
            name="codigo"
            readOnly={Boolean(predio)}
            defaultValue={predio?.codigo}
            required
            maxLength={60}
            pattern="[A-Za-z0-9_-]+"
            autoFocus
            autoComplete="off"
          />
        </label>
        <label>
          Dirección
          <input name="direccion" defaultValue={predio?.direccion} required maxLength={200} />
        </label>
        <label>
          Sector
          <input name="sector" defaultValue={predio?.sector ?? ''} maxLength={120} />
        </label>
        <label>
          Uso registrado
          <input name="uso" defaultValue={predio?.uso ?? ''} maxLength={120} />
        </label>
      </div>
      <label>
        Observaciones
        <textarea
          name="observaciones"
          defaultValue={predio?.observaciones ?? ''}
          maxLength={2000}
        />
      </label>
      <label className="gm-check">
        <input type="checkbox" checked={located} onChange={(e) => setLocated(e.target.checked)} />
        Añadir una referencia espacial de prueba
      </label>
      {located && (
        <fieldset>
          <legend>Ubicación y evidencia</legend>
          <p className="gm-muted">
            Referencia del registro sintético. No se asocia automáticamente a un edificio Overture.
          </p>
          <div className="gm-fields">
            <label>
              Longitud
              <input
                name="longitud"
                type="number"
                step="any"
                min={-180}
                max={180}
                defaultValue={predio?.ubicacion?.coordinates[0]}
                required
              />
            </label>
            <label>
              Latitud
              <input
                name="latitud"
                type="number"
                step="any"
                min={-90}
                max={90}
                defaultValue={predio?.ubicacion?.coordinates[1]}
                required
              />
            </label>
            <label>
              Estado de ubicación
              <select
                name="estadoUbicacion"
                defaultValue={
                  predio?.estado_ubicacion === 'verificada' ? 'verificada' : 'aproximada'
                }
              >
                <option value="aproximada">Aproximada · de prueba</option>
                <option value="verificada">Verificada · de prueba</option>
              </select>
            </label>
            <label>
              Evidencia de ubicación
              <input
                name="evidenciaUbicacion"
                defaultValue={predio?.evidencia_ubicacion}
                required
                maxLength={1000}
              />
            </label>
          </div>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="gm-actions">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar predio'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
