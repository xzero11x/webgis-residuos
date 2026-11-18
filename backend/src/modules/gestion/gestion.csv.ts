import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';

export const csvInput = z
  .object({
    version: z.literal(1),
    sintetico: z.literal(true),
    nombre: z.string().trim().min(1).max(120),
    contenido: z.string().min(1).max(700000),
    separador: z.enum([',', ';', '\t']),
    mapeo: z
      .object({
        codigo: z.string().min(1),
        direccion: z.string().min(1),
        sector: z.string().optional(),
        uso: z.string().optional(),
        observaciones: z.string().optional(),
      })
      .strict(),
  })
  .strict();

// CSV delimitado, comillas dobles escapadas, BOM y saltos de línea dentro de campos.
export function parseCsv(text: string, delimiter: string) {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const fail = () => {
    throw new AppError(
      400,
      'CSV_INVALID',
      'CSV mal formado: revisa comillas, columnas y filas vacías.',
    );
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === delimiter || c === '\n') {
      row.push(cell);
      cell = '';
      closed = false;
      if (c === '\n') {
        rows.push(row);
        row = [];
      }
    } else if (c === '"') {
      if (cell || closed) fail();
      quoted = true;
    } else {
      if (closed) fail();
      cell += c;
    }
    if (rows.length > 501 || row.length > 50 || cell.length > 10000) fail();
  }
  if (quoted) fail();
  if (cell || closed || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  if (
    !headers.length ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length ||
    headers.length > 50 ||
    !rows.length ||
    rows.length > 500 ||
    rows.some((r) => r.length !== headers.length)
  )
    fail();
  return { headers, rows };
}
export function mapCsv(data: z.infer<typeof csvInput>) {
  const { headers, rows } = parseCsv(data.contenido, data.separador);
  const selected = Object.values(data.mapeo).filter(Boolean);
  if (
    new Set(selected).size !== selected.length ||
    selected.some((column) => !headers.includes(column!))
  )
    throw new AppError(
      400,
      'CSV_MAPPING',
      'Elige columnas existentes y distintas para cada campo.',
    );
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(data.mapeo)
        .filter(([, column]) => column)
        .map(([key, column]) => [key, row[headers.indexOf(column!)]!.trim()]),
    ),
  );
}

// Evita fórmulas de hoja de cálculo y escapa siempre separadores/comillas/saltos.
export function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
}
