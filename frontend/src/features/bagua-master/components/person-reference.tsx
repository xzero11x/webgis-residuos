import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { management, showDay, type Person } from '@/features/gestion/api';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams } from 'react-router-dom';

export function PersonReference({
  id,
  onPredio,
  onClose,
}: {
  id: string;
  onPredio: (id: string) => void;
  onClose: () => void;
}) {
  const [params] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [id]);
  const query = useQuery({
    queryKey: ['gestion', 'persona-vinculos', id],
    queryFn: ({ signal }) =>
      management<{
        persona: Person & { fuente: string };
        vinculos: {
          id: string;
          tipo: string;
          desde: string;
          hasta: string | null;
          evidencia: string;
          predio_id: string;
          codigo: string;
          direccion: string;
          estado_ubicacion: string;
          archivado: boolean;
        }[];
        unidades: {
          id: string;
          tipo: string;
          desde: string;
          hasta: string | null;
          evidencia: string;
          unidad_id: string;
          unidad_codigo: string;
          unidad_nombre: string;
          unidad_tipo: string;
          unidad_activa: boolean;
          predio_id: string;
          codigo: string;
          direccion: string;
          archivado: boolean;
        }[];
        masUnidades: boolean;
      }>(`/personas/${id}/predios`, 'GET', undefined, signal),
    retry: false,
    gcTime: 0,
  });
  const data = query.isError ? undefined : query.data;
  return (
    <aside
      className="bm-predio-inspector"
      aria-label="Persona y vínculos autorizados"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header>
        <h2 ref={heading} tabIndex={-1}>
          Persona vinculada
        </h2>
        <Button variant="ghost" size="icon" aria-label="Cerrar persona" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </Button>
      </header>
      <div className="bm-inspector-content">
        {query.isPending ? (
          <p role="status">Consultando vínculos…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>No se pudo consultar. Revisa la sesión y los permisos.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Reintentar vínculos
            </Button>
          </div>
        ) : (
          data && (
            <>
              {params.get('origen_predio') && (
                <Button variant="ghost" onClick={() => onPredio(params.get('origen_predio')!)}>
                  ← Volver al predio de origen
                </Button>
              )}
              <div className="bm-person-head">
                <h3>{data.persona.nombre.replace(/ · persona ficticia$/, '')}</h3>
                <div className="bm-person-chips">
                  <span className="pr-chip is-violet">Persona ficticia</span>
                  <span className="pr-chip pr-mono">{data.persona.codigo}</span>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/bagua-master/expedientes/persona/${id}`}>Abrir expediente</Link>
                </Button>
              </div>
              <p className="bm-person-note">
                {data.vinculos.length === 1
                  ? 'Tiene 1 predio relacionado.'
                  : `Tiene ${data.vinculos.length} predios relacionados.`}{' '}
                Elige cuál ver en el mapa. El tipo de vínculo es una declaración del registro; no
                acredita propiedad legal ni participación en un servicio.
              </p>
              <h3 className="bm-person-section">Predios relacionados</h3>
              {!data.vinculos.length ? (
                <p>Sin vínculos a nivel de predio.</p>
              ) : (
                <ul className="bm-person-links">
                  {data.vinculos.map((link) => (
                    <li key={link.id}>
                      <div className="bm-person-link-top">
                        <strong className="pr-mono">{link.codigo}</strong>
                        <span className={`pr-chip ${link.hasta ? '' : 'is-info'}`}>
                          {link.hasta ? 'Cerrado' : 'Vigente'}
                        </span>
                      </div>
                      <span>{link.direccion}</span>
                      <small>
                        {link.tipo.replace(/_/g, ' ')} · {showDay(link.desde)}
                        {link.hasta ? ` – ${showDay(link.hasta)}` : ' · sin fecha de cierre'}
                        {link.archivado ? ' · predio archivado' : ''}
                      </small>
                      <div className="bm-person-actions">
                        <Button
                          size="sm"
                          aria-label={`Consultar predio ${link.codigo}`}
                          onClick={() => onPredio(link.predio_id)}
                        >
                          Ver en el mapa
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to={`/bagua-master/expedientes/predio/${link.predio_id}`}
                            aria-label={`Expediente del predio ${link.codigo}`}
                          >
                            Expediente
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(data.unidades.length > 0 || data.masUnidades) && (
                <>
                  <h3 className="bm-person-section">Unidades y secciones</h3>
                  <p className="bm-person-note">
                    Relaciones propias de la unidad; no se deducen de las del predio.
                  </p>
                  <ul className="bm-person-links">
                    {data.unidades.map((link) => {
                      const next = new URLSearchParams(params);
                      [
                        'persona',
                        'espacial',
                        'edificio_revision',
                        'accion',
                        'registro',
                        'vista',
                        'trabajo',
                        'ampliar',
                      ].forEach((k) => next.delete(k));
                      next.set('predio', link.predio_id);
                      next.set('unidad', link.unidad_id);
                      return (
                        <li key={link.id}>
                          <div className="bm-person-link-top">
                            <strong>
                              <span className="pr-mono">{link.unidad_codigo}</span> ·{' '}
                              {link.unidad_nombre}
                            </strong>
                            {!link.unidad_activa && <span className="pr-chip">Inactiva</span>}
                          </div>
                          <span>
                            {link.unidad_tipo} de {link.codigo} · {link.direccion}
                          </span>
                          <small>
                            {link.tipo.replace(/_/g, ' ')} · {showDay(link.desde)}
                            {link.hasta ? ` – ${showDay(link.hasta)}` : ' · sin fecha de cierre'}
                          </small>
                          <div className="bm-person-actions">
                            <Button asChild size="sm" variant="outline">
                              <Link
                                to={`?${next}`}
                                aria-label={`Consultar unidad ${link.unidad_codigo} del predio ${link.codigo}`}
                              >
                                Ver unidad
                              </Link>
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {data.masUnidades && (
                    <p className="bm-person-note">
                      Hay más relaciones de unidad que no caben en esta consulta.
                    </p>
                  )}
                </>
              )}
            </>
          )
        )}
      </div>
    </aside>
  );
}
