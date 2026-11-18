import { useState } from 'react';
import { ImportHistory } from './import-history';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useWorkspaceEdits } from './workspace-edits-context';
import './gestion.css';
import { management, localDay, type User } from './api';
import { CsvSource } from './csv-source';
import { env } from '@/config/env';

// Compatibilidad de enlaces anteriores (/bagua-master/gestion): ahora cada tarea tiene su espacio.
export function GestionPage() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('trabajo', 'gestion');
  return <Navigate to={`/bagua-master?${next}`} replace />;
}
export function Reports({ user }: { user: User }) {
  const [params] = useSearchParams();
  const [period, setPeriod] = useState<Record<string, string> | null>(null);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const catalog = useQuery({
    queryKey: ['gestion', 'catalogos'],
    queryFn: () => management<{ servicios: { id: string; nombre: string }[] }>('/catalogos'),
  });
  async function download() {
    if (!period) return;
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch(
        `${env.VITE_API_BASE_URL}/gestion/reportes/exportar?${new URLSearchParams(period)}`,
        { credentials: 'same-origin', signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok)
        throw Error('No se pudo exportar. Revisa tus permisos y vuelve a intentarlo.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bagua-entregas-prueba.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  }
  const query = useQuery({
    queryKey: ['gestion', 'reportes', period],
    queryFn: () =>
      management<{
        items: {
          servicio: string;
          material: string;
          unidad: string | null;
          entregas: number;
          sin_medicion: number;
          cantidad: string | null;
        }[];
        aviso: string;
        fuente: string;
      }>(`/reportes?${new URLSearchParams(period!)}`),
    enabled: !!period,
  });
  return (
    <section className="gm-single">
      <h3>Entregas registradas por periodo</h3>
      <p className="gm-muted">
        Solo registros sintéticos no anulados. Las cantidades se agrupan por material y unidad, sin
        inferir cobertura del servicio.
      </p>
      <form
        className="gm-report-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setPeriod(
            Object.fromEntries([...f.entries()].map(([key, value]) => [key, String(value)])),
          );
        }}
      >
        <label>
          Desde
          <input
            name="desde"
            type="date"
            required
            defaultValue={`${localDay().slice(0, 4)}-01-01`}
          />
        </label>
        <label>
          Hasta
          <input name="hasta" type="date" required defaultValue={localDay()} />
        </label>
        <label>
          Sector del reporte
          <input
            name="sector"
            maxLength={120}
            placeholder="Todos los sectores…"
            defaultValue={params.get('report_sector') || ''}
          />
        </label>
        <label>
          Material del reporte
          <input name="material" maxLength={120} placeholder="Todos los materiales…" />
        </label>
        <label>
          Servicio del reporte
          <select name="servicio">
            <option value="">Todos los servicios</option>
            {catalog.data?.servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <p className="gm-muted">
          Sector y material se filtran por el texto exacto registrado; vacíos incluyen todos.
        </p>
        <Button type="submit">Consultar reporte</Button>
      </form>
      {query.isFetching ? (
        <p role="status">Consultando…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data ? (
        <>
          <p className="gm-muted">
            Fuente: {query.data.fuente} · corte consultado: {period?.desde} a {period?.hasta}
          </p>
          <p>{query.data.aviso}</p>
          {user.rol !== 'consulta' && (
            <Button variant="outline" disabled={exporting} onClick={() => void download()}>
              {exporting ? 'Exportando…' : 'Exportar reporte CSV'}
            </Button>
          )}
          {exportError && <p role="alert">{exportError}</p>}
          {!query.data.items.length ? (
            <p>Sin entregas registradas en el periodo.</p>
          ) : (
            <div className="gm-table-scroll">
              <table>
                <caption>Entregas de prueba por servicio, material y unidad</caption>
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Material</th>
                    <th>Entregas</th>
                    <th>Cantidad medida</th>
                    <th>Sin medición</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((r, i) => (
                    <tr key={i}>
                      <td>{r.servicio}</td>
                      <td>{r.material}</td>
                      <td>{r.entregas}</td>
                      <td>
                        {r.cantidad === null
                          ? 'Sin información'
                          : `${Number(r.cantidad).toLocaleString('es-PE')} ${r.unidad}`}
                      </td>
                      <td>{r.sin_medicion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p>Selecciona el periodo para consultar.</p>
      )}
    </section>
  );
}
export function Imports() {
  const [resolutions, setResolutions] = useState<
    Record<string, { accion: string; campos: string[] }>
  >({});
  const [format, setFormat] = useState('csv');
  const edits = useWorkspaceEdits();
  const client = useQueryClient();
  const [preview, setPreview] = useState<{
      id: string;
      registros: number;
      estado: string;
      puedeAplicar: boolean;
      revision: {
        codigo: string;
        estado: string;
        version: number;
        cambios: { campo: string; local: unknown; externo: unknown }[];
      }[];
    } | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [result, setResult] = useState('');
  const [content, setContent] = useState(
    JSON.stringify(
      {
        version: 1,
        sintetico: true,
        predios: [
          {
            codigo: 'SYN-IMPORT-001',
            direccion: 'Dirección sintética de importación',
            sector: 'Sector de prueba',
          },
        ],
      },
      null,
      2,
    ),
  );
  async function validate(payload?: unknown) {
    setResolutions({});
    setPending(true);
    setError('');
    setPreview(null);
    setResult('');
    try {
      setPreview(
        await management('/importaciones/validar', 'POST', payload ?? JSON.parse(content)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa el JSON.');
    } finally {
      setPending(false);
    }
  }
  async function apply() {
    setPending(true);
    setError('');
    try {
      const r = await management<{
        creados: number;
        actualizados?: number;
        sinCambios?: number;
        repetida: boolean;
      }>(`/importaciones/${preview!.id}/aplicar`, 'POST', {
        resoluciones: preview!.revision
          .filter((row) => row.estado === 'conflicto')
          .map((row) => ({ codigo: row.codigo, version: row.version, ...resolutions[row.codigo] })),
      });
      setResult(
        r.repetida
          ? 'El lote ya estaba aplicado. No se duplicaron registros.'
          : `Importación aplicada: ${r.creados} nuevos, ${r.actualizados ?? 0} actualizados, ${r.sinCambios} sin cambios.`,
      );
      setPreview(null);
      edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el lote.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="gm-single">
      <h3>Preparar una importación</h3>
      <details>
        <summary>Consultar lotes y revertir cambios</summary>
        <ImportHistory />
      </details>
      <p>
        Contrato versión 1 para ensayos sintéticos. Validar no modifica el padrón. Los conflictos se
        detienen sin sobrescribir correcciones locales.
      </p>
      <p className="gm-muted">
        La futura fuente de Rentas necesitará autorización, revisión del formato y conciliación.
        Este contrato rechaza lotes marcados como reales.
      </p>
      <label>
        Formato de importación
        <select
          value={format}
          disabled={pending}
          onChange={(e) => {
            setFormat(e.target.value);
            setPreview(null);
            setError('');
            setResult('');
          }}
        >
          <option value="csv">Archivo CSV con mapeo</option>
          <option value="json">Contrato JSON</option>
        </select>
      </label>
      {format === 'csv' ? (
        <CsvSource
          validate={validate}
          pending={pending}
          changed={() => {
            setPreview(null);
            setError('');
            setResult('');
          }}
        />
      ) : (
        <>
          <label className="gm-import-field">
            Lote JSON
            <textarea
              spellCheck={false}
              value={content}
              onChange={(e) => {
                edits.dirty();
                setContent(e.target.value);
                setPreview(null);
                setResult('');
              }}
              rows={12}
            />
          </label>
          <Button onClick={() => void validate()} disabled={pending}>
            {pending ? 'Procesando…' : 'Validar lote'}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="gm-error">
          {error}
        </p>
      )}
      {preview && (
        <div className="gm-import-review">
          <p>
            {preview.registros} registros válidos. Estado del lote: {preview.estado}.
          </p>
          <div className="gm-table-scroll">
            <table>
              <caption>Revisión antes de aplicar</caption>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {preview.revision.map((row) => (
                  <tr key={row.codigo}>
                    <td>{row.codigo}</td>
                    <td>
                      {row.estado === 'alta'
                        ? 'Nuevo registro'
                        : row.estado === 'sin_cambios'
                          ? 'Sin cambios'
                          : 'Conflicto: requiere revisión'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.revision
            .filter((row) => row.estado === 'conflicto')
            .map((row) => (
              <section key={row.codigo}>
                <h4>Conciliar {row.codigo}</h4>
                <label>
                  Resolución {row.codigo}
                  <select
                    aria-label={`Resolución ${row.codigo}`}
                    value={resolutions[row.codigo]?.accion ?? ''}
                    onChange={(e) =>
                      setResolutions((previous) => ({
                        ...previous,
                        [row.codigo]: { accion: e.target.value, campos: [] },
                      }))
                    }
                  >
                    <option value="">Selecciona una decisión explícita</option>
                    <option value="conservar">Conservar datos locales</option>
                    <option value="actualizar">Elegir campos externos</option>
                  </select>
                </label>
                <ul>
                  {row.cambios.map((change) => (
                    <li key={change.campo}>
                      <strong>{change.campo}</strong>
                      <p>Local: {JSON.stringify(change.local)}</p>
                      <p>Archivo: {JSON.stringify(change.externo)}</p>
                      {resolutions[row.codigo]?.accion === 'actualizar' && (
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Aceptar ${change.campo} ${row.codigo}`}
                            checked={
                              resolutions[row.codigo]?.campos.includes(change.campo) ?? false
                            }
                            onChange={(e) =>
                              setResolutions((previous) => ({
                                ...previous,
                                [row.codigo]: {
                                  accion: 'actualizar',
                                  campos: e.target.checked
                                    ? [...previous[row.codigo]!.campos, change.campo]
                                    : previous[row.codigo]!.campos.filter(
                                        (field) => field !== change.campo,
                                      ),
                                },
                              }))
                            }
                          />
                          Aceptar campo del archivo
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          {!preview.puedeAplicar && (
            <p role="alert">
              Hay conflictos con registros existentes. Corrige el archivo o el mapeo y valida otro
              lote. No se sobrescriben cambios locales.
            </p>
          )}
          <Button
            disabled={
              pending ||
              preview.revision.some(
                (row) =>
                  row.estado === 'conflicto' &&
                  (!resolutions[row.codigo]?.accion ||
                    (resolutions[row.codigo]?.accion === 'actualizar' &&
                      !resolutions[row.codigo]?.campos.length)),
              )
            }
            onClick={() => void apply()}
          >
            Aplicar lote validado
          </Button>
        </div>
      )}
      {result && <p role="status">{result}</p>}
    </section>
  );
}
export { GestionPage as Component };
