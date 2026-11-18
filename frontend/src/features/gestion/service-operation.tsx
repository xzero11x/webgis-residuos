import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, showDay, type User } from './api';
type Operation = {
  id: string;
  predio_id: string;
  codigo: string;
  direccion: string;
  archivado: boolean;
  desde?: string;
  hasta?: string | null;
  estado?: string;
  fecha?: string;
  material?: string;
  cantidad?: string | null;
  unidad?: string | null;
  anulada?: boolean;
  unidad_id?: string;
  unidad_codigo?: string;
  unidad_nombre?: string;
  unidad_activa?: boolean;
};
export function ServiceOperation({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const service = params.get('servicio') || '',
    kind = params.get('operacion') || 'asignaciones';
  const rawPage = Number(params.get('pagina_servicio') || '1');
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const catalog = useQuery({
    queryKey: ['gestion', 'catalogos'],
    queryFn: () =>
      management<{ servicios: { id: string; nombre: string; activo: boolean }[] }>('/catalogos'),
  });
  const query = useQuery({
    queryKey: ['gestion', 'servicio-operacion', service, kind, page],
    queryFn: () =>
      management<{
        servicio: { nombre: string; activo: boolean };
        items: Operation[];
        hayMas: boolean;
      }>(
        `/servicios/${service}/operacion?${new URLSearchParams({ tipo: kind, page: String(page) })}`,
      ),
    enabled: !!service,
    retry: false,
  });
  function change(key: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      if (key !== 'pagina_servicio') next.delete('pagina_servicio');
      return next;
    });
  }
  function predioUrl(row: Operation, activity = false) {
    const next = new URLSearchParams();
    if (row.unidad_id) next.set('unidad', row.unidad_id);
    if (activity) next.set('accion', 'entrega');
    const query = next.toString();
    return `/bagua-master/expedientes/predio/${row.predio_id}${query ? `?${query}` : ''}`;
  }
  return (
    <section className="gm-single">
      <h3>Servicios y registros operativos</h3>
      <p>
        Datos sintéticos, sin validación institucional. Asignación, participación y entrega son
        registros distintos; no acreditan cobertura municipal.
      </p>
      <div className="gm-report-form">
        <label>
          Servicio a consultar
          <select value={service} onChange={(e) => change('servicio', e.target.value)}>
            <option value="">Selecciona un servicio</option>
            {catalog.data?.servicios.map((s) => (
              <option value={s.id} key={s.id}>
                {s.nombre}
                {s.activo ? '' : ' · inactivo'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Registros del servicio
          <select value={kind} onChange={(e) => change('operacion', e.target.value)}>
            <option value="asignaciones">Asignaciones a predios</option>
            <option value="unidades">Asignaciones a unidades</option>
            <option value="participaciones">Participaciones</option>
            <option value="entregas">Entregas registradas</option>
          </select>
        </label>
      </div>
      {catalog.isError && (
        <p role="alert">
          No se pudo cargar el catálogo.{' '}
          <Button onClick={() => void catalog.refetch()}>Reintentar catálogo</Button>
        </p>
      )}
      {!service ? (
        <p>Selecciona un servicio para consultar sus registros.</p>
      ) : query.isPending ? (
        <p role="status">Cargando registros del servicio…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>No se pudieron consultar los registros.</p>
          <Button onClick={() => void query.refetch()}>Reintentar registros</Button>
        </div>
      ) : (
        <>
          <h4>{query.data.servicio.nombre}</h4>
          {!query.data.servicio.activo && <p>Servicio inactivo. Se conserva su historial.</p>}
          {!query.data.items.length && <p>Sin registros de este tipo en esta página.</p>}
          <ul className="gm-records">
            {query.data.items.map((r) => (
              <li key={r.id}>
                <strong>
                  {r.codigo}
                  {r.unidad_codigo ? ` · ${r.unidad_codigo} · ${r.unidad_nombre}` : ''}
                </strong>
                <p>{r.direccion}</p>
                {r.fecha ? (
                  <p>
                    {showDay(r.fecha)} · {r.material} ·{' '}
                    {r.cantidad == null ? 'Sin medición' : `${r.cantidad} ${r.unidad}`} ·{' '}
                    {r.anulada ? 'Anulada; conservada como historial' : 'Registrada'}
                  </p>
                ) : (
                  <p>
                    {showDay(r.desde!)}
                    {r.hasta ? ` hasta ${showDay(r.hasta)}` : ' · sin fecha de cierre'}
                    {r.estado ? ` · ${r.estado}` : ''}
                  </p>
                )}
                {r.archivado && <p>Predio archivado · solo consulta</p>}
                {r.unidad_activa === false && <p>Unidad inactiva · solo consulta</p>}
                <Link to={predioUrl(r)}>
                  {r.unidad_id ? 'Consultar unidad de' : 'Consultar predio'} {r.codigo}
                </Link>
                {user.rol !== 'consulta' &&
                  !r.archivado &&
                  kind === 'participaciones' &&
                  !r.hasta && (
                    <p>
                      <Link to={predioUrl(r, true)}>Registrar actividad en {r.codigo}</Link>
                    </p>
                  )}
              </li>
            ))}
          </ul>
          <nav aria-label="Páginas de registros del servicio">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => change('pagina_servicio', String(page - 1))}
            >
              Anterior
            </Button>
            <span> Página {page} </span>
            <Button
              variant="outline"
              disabled={!query.data.hayMas}
              onClick={() => change('pagina_servicio', String(page + 1))}
            >
              Siguiente
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
