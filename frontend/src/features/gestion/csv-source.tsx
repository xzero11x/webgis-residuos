import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { management } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';

export function CsvSource({
  validate,
  pending,
  changed,
}: {
  validate: (payload: unknown) => Promise<void>;
  pending: boolean;
  changed: () => void;
}) {
  const edits = useWorkspaceEdits();
  const [file, setFile] = useState<{ nombre: string; contenido: string } | null>(null);
  const [separator, setSeparator] = useState(';');
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function inspect(content: string, delimiter: string) {
    setColumns([]);
    setMapping({});
    setLoading(true);
    setError('');
    try {
      const result = await management<{ columnas: string[] }>('/importaciones/columnas', 'POST', {
        contenido: content,
        separador: delimiter,
      });
      setColumns(result.columnas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <form
      onChangeCapture={changed}
      className="gm-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file || !columns.length) return;
        void validate({
          formato: 'csv',
          version: 1,
          sintetico: true,
          ...file,
          separador: separator,
          mapeo: mapping,
        });
      }}
    >
      <p>
        CSV UTF-8, hasta 500 registros y 700 KB. Elige columnas expresamente; no se infiere el
        formato de Rentas. Los predios se importan sin ubicación.
      </p>
      <label>
        Separador CSV
        <select
          value={separator}
          disabled={loading || pending}
          onChange={(e) => {
            setSeparator(e.target.value);
            if (file) void inspect(file.contenido, e.target.value);
          }}
        >
          <option value=";">Punto y coma (;)</option>
          <option value=",">Coma (,)</option>
          <option value={'\t'}>Tabulación</option>
        </select>
      </label>
      <label>
        Archivo CSV de prueba
        <input
          name="archivo"
          type="file"
          accept=".csv,text/csv"
          disabled={loading || pending}
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            setFile(null);
            setColumns([]);
            setMapping({});
            if (!selected) return;
            edits.dirty();
            if (selected.size > 700000) {
              setError('El archivo supera 700 KB. Divide el lote.');
              return;
            }
            try {
              const contenido = new TextDecoder('utf-8', { fatal: true }).decode(
                await selected.arrayBuffer(),
              );
              setFile({ nombre: selected.name, contenido });
              await inspect(contenido, separator);
            } catch {
              setError('El archivo debe estar codificado en UTF-8.');
            }
          }}
        />
      </label>
      {loading && <p role="status">Leyendo estructura…</p>}
      {columns.length > 0 && (
        <>
          <h4>Correspondencia de columnas</h4>
          {Object.entries({
            codigo: 'Código de origen',
            direccion: 'Dirección',
            sector: 'Sector',
            uso: 'Uso',
            observaciones: 'Observaciones',
          }).map(([key, label]) => (
            <label key={key}>
              Columna para {label}
              <select
                aria-label={`Columna para ${label}`}
                required={key === 'codigo' || key === 'direccion'}
                value={mapping[key] || ''}
                onChange={(e) => {
                  edits.dirty();
                  setMapping((previous) => {
                    const next = { ...previous };
                    if (e.target.value) next[key] = e.target.value;
                    else delete next[key];
                    return next;
                  });
                }}
              >
                <option value="">
                  {key === 'codigo' || key === 'direccion'
                    ? 'Selecciona columna obligatoria'
                    : 'Sin columna (opcional)'}
                </option>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <input type="checkbox" required name="sintetico" />
            Confirmo que contiene únicamente datos de prueba no oficiales
          </label>
          <Button type="submit" disabled={pending || loading}>
            {pending ? 'Validando…' : 'Validar archivo y mapeo'}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
