import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management } from '@/features/gestion/api';
import { readSpreadsheet, sha256, type Hoja } from '@/lib/hoja-calculo';
import './padron.css';

// Carga del padrón del programa de segregación desde el Excel de la Gerencia, como venga: se
// eligen las columnas, se valida fila por fila, se corrige en la misma tabla y se confirma. Lo que
// ya existe se actualiza (mismo código, misma dirección o mismo DNI) en vez de duplicarse.

type Kind = 'organicos' | 'reciclables';
type Generator = 'domiciliario' | 'no_domiciliario';
const FIELDS = [
  { id: 'codigo', label: 'Código de padrón', pattern: /c[oó]d/i, required: false },
  { id: 'direccion', label: 'Dirección', pattern: /direcci|domicilio/i, required: true },
  {
    id: 'representante',
    label: 'Representante',
    pattern: /representante|apellido|nombre(?!.*(estab|instit))/i,
    required: true,
  },
  { id: 'dni', label: 'DNI', pattern: /dni|documento|d\.n\.i/i, required: false },
  { id: 'habitantes', label: 'N.° de habitantes', pattern: /habitante/i, required: false },
  { id: 'sector', label: 'Zona o sector', pattern: /zona|sector|barrio/i, required: false },
  {
    id: 'establecimiento',
    label: 'Establecimiento',
    pattern: /establecimiento|instituci|negocio|raz[oó]n/i,
    required: false,
  },
  {
    id: 'tipoEstablecimiento',
    label: 'Tipo de establecimiento',
    pattern: /^tipo|giro|rubro/i,
    required: false,
  },
] as const;
type Field = (typeof FIELDS)[number]['id'];
type Row = { fila: number } & Record<Field, string>;
interface Check {
  fila: number;
  estado: 'nuevo' | 'actualiza' | 'error';
  errores: string[];
  avisos: string[];
  predio: { codigo: string } | null;
  ubicacion: { base: 'predio' | 'calle' } | null;
}
interface Validation {
  filas: Check[];
  resumen: {
    filas: number;
    nuevos: number;
    actualizados: number;
    errores: number;
    conAvisos: number;
    sinUbicar: number;
  };
  yaImportado: { creadoEn: string; revertidoEn: string | null } | null;
}
const ANNEX: Record<string, [Kind, Generator]> = {
  '03-A': ['reciclables', 'domiciliario'],
  '03-B': ['reciclables', 'no_domiciliario'],
  '03-C': ['organicos', 'domiciliario'],
  '03-D': ['organicos', 'no_domiciliario'],
};

function detectHeader(rows: string[][]) {
  const index = rows
    .slice(0, 20)
    .findIndex((r) => r.some((c) => /direcci|domicilio/i.test(c ?? '')));
  return index < 0 ? 0 : index;
}
function autoMap(header: string[], generator: Generator) {
  const used = new Set<number>();
  const map = {} as Record<Field, number>;
  for (const f of FIELDS) {
    if (f.id === 'establecimiento' && generator === 'domiciliario') {
      map[f.id] = -1;
      continue;
    }
    const i = header.findIndex((h, k) => !used.has(k) && f.pattern.test(h ?? ''));
    map[f.id] = i;
    if (i >= 0) used.add(i);
  }
  return map;
}

export function ImportarPadron() {
  const client = useQueryClient();
  const [kind, setKind] = useState<Kind>('reciclables');
  const [generator, setGenerator] = useState<Generator>('domiciliario');
  const [file, setFile] = useState<{ name: string; hash: string; sheets: Hoja[] } | null>(null);
  const [sheet, setSheet] = useState(0);
  const [map, setMap] = useState<Record<Field, number> | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<Validation | null>(null);
  const [filter, setFilter] = useState<'todas' | 'errores' | 'avisos'>('todas');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; resumen: Record<string, unknown> } | null>(null);
  const history = useQuery({
    queryKey: ['gestion', 'padron-importaciones'],
    queryFn: ({ signal }) =>
      management<{
        items: {
          id: string;
          archivo: string;
          servicio: string;
          tipoGenerador: string;
          filas: number;
          resumen: Record<string, number>;
          creadoEn: string;
          usuario: string;
          revertidoEn: string | null;
          motivoReversion: string | null;
        }[];
      }>('/padron/importaciones', 'GET', undefined, signal),
  });

  const grid = useMemo(() => file?.sheets[sheet]?.filas ?? [], [file, sheet]);
  const headerIndex = useMemo(() => detectHeader(grid), [grid]);
  const header = grid[headerIndex] ?? [];

  async function open(input: File) {
    setError('');
    setResult(null);
    setDone(null);
    try {
      const [sheets, hash] = await Promise.all([readSpreadsheet(input), sha256(input)]);
      const firstUseful = Math.max(
        0,
        sheets.findIndex((s) => s.filas.length > 1),
      );
      const text = sheets[firstUseful]?.filas.slice(0, 6).flat().join(' ') ?? '';
      const annex = /03-([ABCD])/i.exec(text)?.[0]?.toUpperCase();
      let g = generator;
      if (annex && ANNEX[annex]) {
        setKind(ANNEX[annex][0]);
        g = ANNEX[annex][1];
        setGenerator(g);
      }
      setFile({ name: input.name, hash, sheets });
      setSheet(firstUseful);
      const grid0 = sheets[firstUseful]?.filas ?? [];
      setMap(autoMap(grid0[detectHeader(grid0)] ?? [], g));
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  }
  function buildRows(): Row[] {
    if (!map) return [];
    return grid
      .slice(headerIndex + 1)
      .map((cells, i) => {
        const row = { fila: headerIndex + i + 2 } as Row;
        for (const f of FIELDS)
          row[f.id] = map[f.id] >= 0 ? String(cells?.[map[f.id]] ?? '').trim() : '';
        return row;
      })
      .filter((r) => r.direccion || r.representante || r.dni)
      .filter((r) => !/^total/i.test(r.direccion));
  }
  const validate = useMutation({
    mutationFn: (data: Row[]) =>
      management<Validation>('/padron/importar/validar', 'POST', {
        servicio: kind,
        tipoGenerador: generator,
        archivo: file!.name,
        sha256: file!.hash,
        filas: data,
      }),
    onSuccess: (data) => {
      setResult(data);
      setFilter(data.resumen.errores ? 'errores' : 'todas');
    },
  });
  const apply = useMutation({
    mutationFn: () =>
      management<{ id: string; resumen: Record<string, unknown> }>(
        '/padron/importar/aplicar',
        'POST',
        {
          servicio: kind,
          tipoGenerador: generator,
          archivo: file!.name,
          sha256: file!.hash,
          filas: rows,
        },
      ),
    onSuccess: (data) => {
      setDone(data);
      setResult(null);
      setFile(null);
      void client.invalidateQueries({ queryKey: ['gestion'] });
    },
  });
  const revert = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      management(`/padron/importaciones/${id}/revertir`, 'POST', { motivo }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['gestion'] }),
  });

  const checks = new Map((result?.filas ?? []).map((c) => [c.fila, c]));
  const visible = rows.filter((r) => {
    const c = checks.get(r.fila);
    return (
      filter === 'todas' || (filter === 'errores' ? c?.estado === 'error' : !!c?.avisos.length)
    );
  });
  const edit = (fila: number, field: Field, value: string) =>
    setRows((list) => list.map((r) => (r.fila === fila ? { ...r, [field]: value } : r)));
  const shownFields = FIELDS.filter((f) =>
    generator === 'domiciliario'
      ? f.id !== 'establecimiento' && f.id !== 'tipoEstablecimiento'
      : f.id !== 'habitantes',
  );

  return (
    <div className="pd" data-testid="importar-padron">
      <div className="pr-section-head">
        <div>
          <h2>Cargar el padrón desde Excel</h2>
          <p>
            Sube el archivo de la Gerencia tal como esté (.xlsx o .csv). Se reconocen las columnas,
            se valida cada fila y puedes corregir aquí mismo. Nada se guarda hasta que confirmes.
          </p>
        </div>
      </div>

      {done && (
        <p className="pr-notice is-info" role="status">
          <CheckCircle2 size={15} aria-hidden="true" /> Padrón cargado:{' '}
          {String(done.resumen.nuevos)} inscripciones nuevas y {String(done.resumen.actualizados)}{' '}
          actualizadas. Ya aparecen en el <Link to="/bagua-master/resultados">padrón</Link> y en el
          recorrido de campo.
        </p>
      )}

      <div className="pd-paso">
        <div className="pr-segmented" role="group" aria-label="Programa">
          {(['reciclables', 'organicos'] as Kind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'organicos' ? 'Orgánicos' : 'Reciclables'}
            </button>
          ))}
        </div>
        <div className="pr-segmented" role="group" aria-label="Tipo de generador">
          {(['domiciliario', 'no_domiciliario'] as Generator[]).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={generator === g}
              onClick={() => {
                setGenerator(g);
                if (file) setMap(autoMap(header, g));
                setResult(null);
              }}
            >
              {g === 'domiciliario' ? 'Viviendas' : 'No domiciliarios'}
            </button>
          ))}
        </div>
        <span className="pd-anexo">
          Anexo {Object.entries(ANNEX).find(([, v]) => v[0] === kind && v[1] === generator)?.[0]}
        </span>
        <label className="pd-archivo">
          <Upload size={15} aria-hidden="true" />
          {file ? file.name : 'Elegir archivo'}
          <input
            type="file"
            accept=".xlsx,.csv,.txt,.xls"
            data-testid="pd-archivo"
            onChange={(event) => {
              const input = event.target.files?.[0];
              if (input) void open(input);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="pr-error">
          {error}
        </p>
      )}

      {file && map && !result && (
        <section className="pd-mapeo" aria-labelledby="pd-columnas">
          <h3 id="pd-columnas">
            <FileSpreadsheet size={15} aria-hidden="true" /> Columnas · fila de títulos{' '}
            {headerIndex + 1}, {Math.max(0, grid.length - headerIndex - 1)} filas de datos
          </h3>
          {file.sheets.length > 1 && (
            <label>
              Hoja
              <select
                className="pr-field"
                value={sheet}
                onChange={(event) => {
                  const s = Number(event.target.value);
                  setSheet(s);
                  const g = file.sheets[s]?.filas ?? [];
                  setMap(autoMap(g[detectHeader(g)] ?? [], generator));
                }}
              >
                {file.sheets.map((s, i) => (
                  <option key={s.nombre} value={i}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="pd-campos">
            {shownFields.map((f) => (
              <label key={f.id}>
                {f.label}
                {f.required || (f.id === 'establecimiento' && generator === 'no_domiciliario')
                  ? ' *'
                  : ''}
                <select
                  className="pr-field"
                  value={map[f.id]}
                  onChange={(event) => setMap({ ...map, [f.id]: Number(event.target.value) })}
                >
                  <option value={-1}>— No está en el archivo —</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="pr-actions">
            <Button
              disabled={map.direccion < 0 || map.representante < 0 || validate.isPending}
              onClick={() => {
                const built = buildRows();
                setRows(built);
                validate.mutate(built);
              }}
              data-testid="pd-validar"
            >
              Validar {buildRows().length} filas
            </Button>
          </div>
        </section>
      )}
      {validate.isError && (
        <p role="alert" className="pr-error">
          {validate.error instanceof Error ? validate.error.message : 'No se pudo validar.'}
        </p>
      )}

      {result && (
        <section className="pd-resultado" aria-labelledby="pd-resultado-t">
          <h3 id="pd-resultado-t">Revisión fila por fila</h3>
          {result.yaImportado && !result.yaImportado.revertidoEn && (
            <p className="pr-notice">
              Este mismo archivo ya se cargó antes. Si lo confirmas, se actualizará lo existente.
            </p>
          )}
          <div className="pd-resumen">
            <span className="pr-chip is-info">{result.resumen.nuevos} nuevos</span>
            <span className="pr-chip">{result.resumen.actualizados} se actualizan</span>
            <span className={`pr-chip ${result.resumen.errores ? 'is-danger' : ''}`}>
              {result.resumen.errores} con errores
            </span>
            <span className="pr-chip is-warn">{result.resumen.conAvisos} con avisos</span>
            <span className="pr-chip">
              {result.resumen.sinUbicar} quedan para ubicar en el mapa
            </span>
          </div>
          <div className="pr-segmented" role="group" aria-label="Filtrar filas">
            {(['todas', 'errores', 'avisos'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'todas' ? 'Todas' : f === 'errores' ? 'Con errores' : 'Con avisos'}
              </button>
            ))}
          </div>
          <div className="op-tabla-scroll">
            <table className="op-tabla pd-tabla">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Estado</th>
                  {shownFields.map((f) => (
                    <th key={f.id}>{f.label}</th>
                  ))}
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 300).map((r) => {
                  const c = checks.get(r.fila);
                  const bad = c?.estado === 'error';
                  return (
                    <tr key={r.fila} className={bad ? 'is-error' : ''}>
                      <td>{r.fila}</td>
                      <td>
                        <span
                          className={`pr-chip ${bad ? 'is-danger' : c?.estado === 'actualiza' ? '' : 'is-info'}`}
                        >
                          {bad ? 'Error' : c?.estado === 'actualiza' ? 'Actualiza' : 'Nuevo'}
                        </span>
                      </td>
                      {shownFields.map((f) => (
                        <td key={f.id}>
                          {bad ? (
                            <input
                              className="pd-celda"
                              value={r[f.id]}
                              aria-label={`${f.label}, fila ${r.fila}`}
                              onChange={(event) => edit(r.fila, f.id, event.target.value)}
                            />
                          ) : (
                            r[f.id]
                          )}
                        </td>
                      ))}
                      <td className="pd-obs">
                        {c?.errores.map((m) => (
                          <span key={m} className="is-error">
                            {m}
                          </span>
                        ))}
                        {c?.avisos.map((m) => (
                          <span key={m}>{m}</span>
                        ))}
                        {c?.predio && <span>Predio {c.predio.codigo}</span>}
                        {c?.ubicacion?.base === 'calle' && (
                          <span>Ubicado entre vecinos de la calle</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length > 300 && (
            <p className="op-nota">Se muestran 300 de {visible.length} filas.</p>
          )}
          {apply.isError && (
            <p role="alert" className="pr-error">
              {apply.error instanceof Error ? apply.error.message : 'No se pudo cargar.'}
            </p>
          )}
          <div className="pr-actions">
            <Button variant="ghost" onClick={() => setResult(null)}>
              Volver a las columnas
            </Button>
            {result.resumen.errores > 0 && (
              <Button
                variant="outline"
                disabled={validate.isPending}
                onClick={() => validate.mutate(rows)}
              >
                Revalidar con las correcciones
              </Button>
            )}
            <Button
              disabled={result.resumen.errores > 0 || apply.isPending}
              onClick={() => apply.mutate()}
              data-testid="pd-confirmar"
            >
              Confirmar la carga de {result.resumen.filas} filas
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="pd-historial">
        <h3 id="pd-historial" className="op-subtitulo">
          Cargas anteriores
        </h3>
        {history.data?.items.length ? (
          <ul className="pr-list">
            {history.data.items.map((h) => (
              <li key={h.id}>
                <div className="pr-list-main">
                  <strong>
                    {h.archivo} · {h.servicio === 'SIM-ORGANICOS' ? 'orgánicos' : 'reciclables'} ·{' '}
                    {h.tipoGenerador === 'domiciliario' ? 'viviendas' : 'no domiciliarios'}
                  </strong>
                  <span>
                    {new Date(h.creadoEn).toLocaleString('es-PE')} · {h.usuario.split(' · ')[0]} ·{' '}
                    {h.resumen.nuevos} nuevos, {h.resumen.actualizados} actualizados
                    {h.revertidoEn ? ` · revertido: ${h.motivoReversion}` : ''}
                  </span>
                </div>
                {!h.revertidoEn && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revert.isPending}
                    onClick={() => {
                      const motivo = window.prompt(
                        'Motivo para revertir esta carga (mínimo 5 caracteres):',
                      );
                      if (motivo && motivo.trim().length >= 5)
                        revert.mutate({ id: h.id, motivo: motivo.trim() });
                    }}
                  >
                    <RotateCcw size={13} aria-hidden="true" /> Revertir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="op-nota">Aún no se cargó ningún padrón desde archivo.</p>
        )}
        {revert.isError && (
          <p role="alert" className="pr-error">
            {revert.error instanceof Error ? revert.error.message : 'No se pudo revertir.'}
          </p>
        )}
      </section>
    </div>
  );
}
