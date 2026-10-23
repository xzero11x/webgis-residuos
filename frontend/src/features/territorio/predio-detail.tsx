import { useState } from 'react';
import { Clock3, MapPin, Pencil, Route, Trash2, UserRound, VectorSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Predio } from './types';

export function PredioDetail({
  predio,
  onClose,
  onEdit,
  onDelete,
  deleting,
  error,
}: {
  predio: Predio;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  error?: string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className={`detail-panel ${expanded ? 'expanded' : ''}`} aria-label="Ficha del predio">
      <button
        type="button"
        className="detail-mobile-handle"
        aria-label={expanded ? 'Contraer ficha' : 'Expandir ficha'}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span />
      </button>
      <div className="panel-heading">
        <div>
          <span className="demo-tag">PREDIO DEMO</span>
          <h2>{predio.codigo}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Cerrar ficha" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="panel-scroll">
        <p className="detail-address">
          <MapPin className="size-4 shrink-0" />
          {predio.direccion}
        </p>
        <div className="detail-metrics">
          <div>
            <span>Sector</span>
            <strong>{predio.sector}</strong>
          </div>
          <div>
            <span className="flex items-center gap-1">
              <VectorSquare className="size-3" />
              Superficie
            </span>
            <strong>{predio.areaM2.toLocaleString('es-PE')} m²</strong>
          </div>
        </div>
        <section className="detail-section">
          <h3>
            <UserRound />
            Personas vinculadas
          </h3>
          {predio.personas.length ? (
            predio.personas.map((persona, index) => (
              <div className="person-row" key={index}>
                <div className="person-avatar">
                  <UserRound className="size-4" />
                </div>
                <div>
                  <p>{persona.nombre}</p>
                  <span>{persona.vinculo}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Sin persona vinculada.</p>
          )}
        </section>
        <section className="detail-section">
          <h3>
            <Route />
            Servicios de recolección
          </h3>
          {predio.servicios.length ? (
            predio.servicios.map((servicio) => (
              <div className="service-card" key={servicio.servicioId}>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: servicio.color }}
                  />
                  {servicio.nombre}
                </div>
                <p className="mt-3 text-xs">{servicio.ruta || 'Sin ruta asignada'}</p>
                {servicio.ruta && (
                  <>
                    <p className="mt-1 text-[10px] text-muted-foreground">{servicio.codigoRuta}</p>
                    <div className="route-schedule">
                      <Clock3 className="size-3.5" />
                      <div>
                        <strong>{servicio.horario}</strong>
                        <span>{servicio.frecuencia}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Sin servicio asociado.</p>
          )}
        </section>
        {predio.observaciones && (
          <details className="detail-section">
            <summary className="text-xs font-medium">Observaciones</summary>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{predio.observaciones}</p>
          </details>
        )}
        <p className="mt-5 text-[10px] leading-5 text-muted-foreground">
          Datos y horarios de prueba. Último cambio:{' '}
          {new Date(predio.updatedAt).toLocaleString('es-PE', {
            timeZone: 'America/Lima',
            dateStyle: 'short',
            timeStyle: 'short',
          })}
          .
        </p>
        {error && (
          <p className="form-error mt-3" role="alert">
            {error}
          </p>
        )}
        {confirmDelete && (
          <div className="delete-confirm" role="alert">
            <p>¿Eliminar {predio.codigo}? Se quitará el predio y sus asociaciones.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Conservar
              </Button>
              <Button size="sm" disabled={deleting} className="bg-destructive" onClick={onDelete}>
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <footer className="panel-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Eliminar predio"
          disabled={deleting}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 />
        </Button>
        <Button className="flex-1" disabled={deleting} onClick={onEdit}>
          <Pencil />
          Editar predio
        </Button>
      </footer>
    </aside>
  );
}
