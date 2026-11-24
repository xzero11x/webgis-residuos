import { useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { EyeOff, MapPin, PenLine, Plus, Undo2, X } from 'lucide-react';
import {
  useAnnulMapCorrection,
  useCreateMapCorrection,
  useMapCorrectionList,
} from '../hooks/use-map-corrections';
import type { MapCorrectionEntry, MapDrawing, Selection } from '../types';

// Correcciones cartográficas locales: quien conoce Bagua marca lo que no existe, reubica un lugar
// o dibuja una edificación que falta. Se guardan aparte y el mapa las aplica sobre Overture.

const KIND: Record<string, string> = {
  lugar: 'lugar',
  edificio: 'edificación',
  edificio_complemento: 'edificación',
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo guardar la corrección.';
}

/** Acciones de corrección en la ficha de un lugar o una edificación. */
export function CorrectionActions({
  selection,
  onMove,
  onHidden,
}: {
  selection: Selection;
  onMove: () => void;
  onHidden: () => void;
}) {
  const [hiding, setHiding] = useState(false);
  const [motivo, setMotivo] = useState('');
  const create = useCreateMapCorrection();
  if (!['lugar', 'edificio', 'edificio_complemento'].includes(selection.tabla)) return null;
  const tabla = selection.tabla as 'lugar' | 'edificio' | 'edificio_complemento';
  return (
    <section className="bm-corregir" data-testid="bm-corregir">
      <h3>Corregir el mapa</h3>
      {!hiding ? (
        <div className="bm-corregir-acciones">
          <button type="button" onClick={() => setHiding(true)} data-testid="bm-corregir-ocultar">
            <EyeOff size={14} aria-hidden="true" />
            No existe
          </button>
          {tabla === 'lugar' && (
            <button type="button" onClick={onMove} data-testid="bm-corregir-mover">
              <MapPin size={14} aria-hidden="true" />
              Mover ubicación
            </button>
          )}
        </div>
      ) : (
        <form
          className="bm-corregir-form"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(
              { accion: 'ocultar', tabla, elementoId: selection.id, motivo: motivo.trim() },
              { onSuccess: onHidden },
            );
          }}
        >
          <label htmlFor="bm-motivo-ocultar">
            ¿Por qué esta {KIND[tabla]} no existe? Quedará oculta para todos; se puede deshacer.
          </label>
          <textarea
            id="bm-motivo-ocultar"
            rows={2}
            maxLength={500}
            required
            minLength={3}
            placeholder="Ej.: es la glorieta de la plaza, no una vivienda"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
          />
          {create.isError && <p role="alert">{errorText(create.error)}</p>}
          <div className="bm-corregir-acciones">
            <button
              type="submit"
              className="is-primary"
              disabled={create.isPending || motivo.trim().length < 3}
            >
              {create.isPending ? 'Guardando…' : 'Ocultar del mapa'}
            </button>
            <button type="button" onClick={() => setHiding(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function describe(entry: MapCorrectionEntry) {
  const name = entry.nombre || entry.nombreElemento;
  if (entry.accion === 'agregar') return `Edificación agregada${name ? ` · ${name}` : ''}`;
  if (entry.accion === 'mover') return `Lugar reubicado${name ? ` · ${name}` : ''}`;
  return `${entry.tabla === 'lugar' ? 'Lugar' : 'Edificación'} oculto${name ? ` · ${name}` : ''}`;
}

/** Lista de correcciones vigentes con su autor y motivo; cada una se puede deshacer. */
export function CorrectionsPanel({
  map,
  onClose,
  onAddBuilding,
}: {
  map: MapLibreMap | null;
  onClose: () => void;
  onAddBuilding: () => void;
}) {
  const list = useMapCorrectionList(true);
  const annul = useAnnulMapCorrection();
  const [undoing, setUndoing] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const items = list.data?.correcciones ?? [];
  return (
    <aside
      className="bm-info bm-correcciones"
      aria-label="Correcciones del mapa"
      data-testid="bm-correcciones"
    >
      <header className="bm-info-head">
        <div className="bm-info-heading" style={{ paddingLeft: 8 }}>
          <p className="bm-info-kind">Correcciones locales</p>
          <h2 className="bm-info-title">Corregir el mapa de Bagua</h2>
        </div>
        <button
          type="button"
          className="bm-info-close"
          aria-label="Cerrar correcciones"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="bm-info-body">
        <p className="bm-rutas-ayuda">
          Toca un lugar o una edificación para marcar que no existe o mover su ubicación. Las
          correcciones se aplican encima de los datos abiertos y no se pierden al actualizarlos.
        </p>
        <button
          type="button"
          className="bm-corregir-agregar"
          onClick={onAddBuilding}
          data-testid="bm-agregar-edificio"
        >
          <Plus size={15} aria-hidden="true" />
          Dibujar una edificación que falta
        </button>
        {list.isPending ? (
          <p role="status">Cargando correcciones…</p>
        ) : list.isError ? (
          <p role="alert">No se pudieron cargar las correcciones.</p>
        ) : items.length === 0 ? (
          <p>Aún no hay correcciones.</p>
        ) : (
          <ul className="bm-correcciones-lista">
            {items.map((entry) => (
              <li key={entry.id} data-testid={`bm-correccion-${entry.accion}`}>
                <button
                  type="button"
                  className="bm-correcciones-ir"
                  disabled={!entry.punto || !map}
                  onClick={() =>
                    entry.punto &&
                    map?.flyTo({
                      center: entry.punto.coordinates,
                      zoom: 18,
                      duration: 800,
                      essential: true,
                    })
                  }
                >
                  <strong>{describe(entry)}</strong>
                  <span>
                    {entry.motivo} · {entry.autor} ·{' '}
                    {new Date(entry.creadoEn).toLocaleDateString('es-PE')}
                  </span>
                </button>
                {undoing === entry.id ? (
                  <form
                    className="bm-corregir-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      annul.mutate(
                        { id: entry.id, motivo: motivo.trim() },
                        {
                          onSuccess: () => {
                            setUndoing(null);
                            setMotivo('');
                          },
                        },
                      );
                    }}
                  >
                    <label htmlFor={`bm-motivo-${entry.id}`}>¿Por qué se deshace?</label>
                    <input
                      id={`bm-motivo-${entry.id}`}
                      required
                      minLength={3}
                      maxLength={500}
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                    />
                    {annul.isError && <p role="alert">{errorText(annul.error)}</p>}
                    <div className="bm-corregir-acciones">
                      <button
                        type="submit"
                        className="is-primary"
                        disabled={annul.isPending || motivo.trim().length < 3}
                      >
                        Deshacer
                      </button>
                      <button type="button" onClick={() => setUndoing(null)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="bm-correcciones-deshacer"
                    aria-label={`Deshacer: ${describe(entry)}`}
                    onClick={() => {
                      setUndoing(entry.id);
                      setMotivo('');
                    }}
                  >
                    <Undo2 size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/** Barra de la edición en curso: indica qué tocar, pide el motivo y guarda. */
export function DrawBar({
  drawing,
  onUndoPoint,
  onCancel,
  onSaved,
}: {
  drawing: MapDrawing;
  onUndoPoint: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [nombre, setNombre] = useState('');
  const create = useCreateMapCorrection();
  const ready =
    motivo.trim().length >= 3 &&
    (drawing.tipo === 'mover' ? !!drawing.punto : drawing.puntos.length >= 3);
  const hint =
    drawing.tipo === 'mover'
      ? drawing.punto
        ? `Nueva ubicación de «${drawing.nombre}» marcada. Toca otra vez para cambiarla.`
        : `Toca el mapa donde está realmente «${drawing.nombre}».`
      : drawing.puntos.length < 3
        ? `Toca las esquinas de la edificación (${drawing.puntos.length} de al menos 3).`
        : `${drawing.puntos.length} esquinas. Sigue tocando o guarda.`;
  return (
    <form
      className="bm-dibujo-barra"
      data-testid="bm-dibujo-barra"
      onSubmit={(event) => {
        event.preventDefault();
        const input =
          drawing.tipo === 'mover'
            ? {
                accion: 'mover' as const,
                tabla: 'lugar' as const,
                elementoId: drawing.elementoId,
                punto: drawing.punto!,
                motivo: motivo.trim(),
              }
            : {
                accion: 'agregar' as const,
                tabla: 'edificio' as const,
                anillo: drawing.puntos,
                motivo: motivo.trim(),
                ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
              };
        create.mutate(input, { onSuccess: onSaved });
      }}
    >
      <p className="bm-dibujo-ayuda" role="status">
        <PenLine size={14} aria-hidden="true" />
        {hint}
      </p>
      <div className="bm-dibujo-campos">
        {drawing.tipo === 'agregar' && (
          <input
            aria-label="Nombre o uso (opcional)"
            placeholder="Nombre o uso (opcional)"
            maxLength={120}
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
          />
        )}
        <input
          aria-label="Motivo de la corrección"
          placeholder="Motivo (obligatorio)"
          required
          minLength={3}
          maxLength={500}
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
        />
      </div>
      {create.isError && <p role="alert">{errorText(create.error)}</p>}
      <div className="bm-corregir-acciones">
        <button type="submit" className="is-primary" disabled={!ready || create.isPending}>
          {create.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {drawing.tipo === 'agregar' && drawing.puntos.length > 0 && (
          <button type="button" onClick={onUndoPoint}>
            Quitar última esquina
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
