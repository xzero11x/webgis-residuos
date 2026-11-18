import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management } from './api';

type Entry = {
  id: string;
  accion: string;
  creado_en: string;
  responsable: string;
  predio_id: string | null;
  predio_codigo: string | null;
};
export function Audit() {
  const [action, setAction] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ['gestion', 'auditoria', action, cursor],
    queryFn: () =>
      management<{ items: Entry[]; siguiente: string | null }>(
        `/auditoria?${new URLSearchParams({ accion: action, ...(cursor ? { antes: cursor } : {}) })}`,
      ),
  });
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAction(String(new FormData(e.currentTarget).get('accion') ?? '').trim());
    setCursors([]);
  }
  return (
    <section className="gm-single">
      <h3>Auditoría de operaciones</h3>
      <p>
        Responsable, fecha y acción registrada. Los valores personales anteriores y nuevos
        permanecen fuera de esta consulta global.
      </p>
      <form className="gm-report-form" onSubmit={filter}>
        <label>
          Acción exacta
          <input name="accion" placeholder="Ej.: predio.archivado" maxLength={100} />
        </label>
        <Button type="submit">Filtrar auditoría</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCursors([]);
            void query.refetch();
          }}
        >
          Actualizar auditoría
        </Button>
      </form>
      {query.isPending ? (
        <p role="status">Cargando auditoría…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>No se pudo consultar la auditoría.</p>
          <Button onClick={() => void query.refetch()}>Reintentar</Button>
        </div>
      ) : (
        <>
          {!query.data.items.length ? (
            <p>No hay operaciones que coincidan con este filtro.</p>
          ) : (
            <div className="gm-table-scroll">
              <table>
                <caption>Operaciones registradas, de más reciente a más antigua</caption>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Responsable</th>
                    <th>Predio</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((row) => {
                    return (
                      <tr key={row.id}>
                        <td>{new Date(row.creado_en).toLocaleString('es-PE')}</td>
                        <td>{row.accion}</td>
                        <td>{row.responsable}</td>
                        <td>
                          {row.predio_id ? (
                            <Link to={`/bagua-master/expedientes/predio/${row.predio_id}`}>
                              {row.predio_codigo}
                            </Link>
                          ) : (
                            'Operación general'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="gm-pagination">
            <Button
              variant="outline"
              disabled={!cursors.length}
              onClick={() => setCursors((c) => c.slice(0, -1))}
            >
              Más recientes
            </Button>
            <span>Página {cursors.length + 1}</span>
            <Button
              variant="outline"
              disabled={!query.data.siguiente}
              onClick={() => setCursors((c) => [...c, query.data.siguiente!])}
            >
              Más antiguas
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
