import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management, showDay } from '@/features/gestion/api';
export function UnitReference({ predio, id }: { predio: string; id: string }) {
  const [params, setParams] = useSearchParams();
  const units = useQuery({
    queryKey: ['gestion', 'unidades', predio],
    queryFn: () =>
      management<{
        items: { id: string; codigo: string; nombre: string; tipo: string; activa: boolean }[];
      }>(`/predios/${predio}/unidades`),
    retry: false,
  });
  const relations = useQuery({
    queryKey: ['gestion', 'unidad-relaciones', id],
    queryFn: () =>
      management<{
        items: {
          id: string;
          tipo: string;
          desde: string;
          hasta: string | null;
          persona?: string;
          persona_id?: string;
          servicio?: string;
          servicio_id?: string;
          estado: string | null;
        }[];
        personasPermitidas: boolean;
      }>(`/predios/${predio}/unidades/${id}/relaciones`),
    retry: false,
  });
  const unit = units.data?.items.find((u) => u.id === id);
  function url(values: Record<string, string>, remove: string[] = []) {
    const next = new URLSearchParams(params);
    remove.forEach((k) => next.delete(k));
    Object.entries(values).forEach(([k, v]) => next.set(k, v));
    return `?${next}`;
  }
  return (
    <aside className="bm-predio-inspector" aria-label="Ficha contextual de la unidad">
      <header>
        <Button
          variant="ghost"
          onClick={() =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              n.delete('unidad');
              return n;
            })
          }
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver al predio
        </Button>
      </header>
      <div className="bm-inspector-content">
        {units.isPending || relations.isPending ? (
          <p role="status">Consultando unidad…</p>
        ) : units.isError || relations.isError ? (
          <>
            <p role="alert">No se pudo cargar esta unidad.</p>
            <Button
              onClick={() => {
                void units.refetch();
                void relations.refetch();
              }}
            >
              Reintentar unidad
            </Button>
          </>
        ) : !unit ? (
          <p>No se encontró la unidad en este predio.</p>
        ) : (
          <>
            <h2>{unit.nombre}</h2>
            <p>
              {unit.codigo} · {unit.tipo} · {unit.activa ? 'Activa' : 'Inactiva'}
            </p>
            <p className="bm-inspector-source">
              Datos sintéticos · subdivisión administrativa, sin límites cartográficos atribuidos.
            </p>
            <h3>Personas de esta unidad</h3>
            {!relations.data.personasPermitidas ? (
              <p>Tu perfil no consulta identidades personales.</p>
            ) : (
              <ul className="bm-inspector-list">
                {relations.data.items
                  .filter((r) => r.persona_id)
                  .map((r) => (
                    <li key={r.id}>
                      <Link
                        to={url({ persona: r.persona_id!, origen_predio: predio }, [
                          'predio',
                          'unidad',
                          'ficha',
                        ])}
                      >
                        {r.persona}
                      </Link>
                      <p>
                        {r.tipo} · {showDay(r.desde)}
                        {r.hasta ? ` hasta ${showDay(r.hasta)}` : ''}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
            <h3>Servicios de esta unidad</h3>
            <ul className="bm-inspector-list">
              {relations.data.items
                .filter((r) => r.servicio)
                .map((r) => (
                  <li key={r.id}>
                    <strong>{r.servicio}</strong>
                    <p>
                      {r.estado} · desde {showDay(r.desde)}
                    </p>
                    {r.servicio_id && (
                      <Link
                        to={url({
                          trabajo: 'gestion',
                          vista: 'servicios',
                          servicio: r.servicio_id,
                          operacion: 'entregas',
                        })}
                      >
                        Consultar actividad del servicio →
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
            {!relations.data.items.length && <p>Sin relaciones registradas para esta unidad.</p>}
          </>
        )}
      </div>
      <footer>
        <Link to={`/bagua-master/expedientes/predio/${predio}?unidad=${id}`}>
          Abrir expediente del predio
        </Link>
      </footer>
    </aside>
  );
}
