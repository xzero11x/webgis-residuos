// Lectura de hojas de cálculo en el navegador, sin dependencias: .xlsx (Excel 2007 en adelante) y
// .csv. Un .xlsx es un zip con XML; se descomprime con DecompressionStream y se leen las celdas
// como texto, tal como se ven. El archivo nunca sale del navegador hasta que la persona confirma.

export interface Hoja {
  nombre: string;
  filas: string[][];
}

const textDecoder = new TextDecoder('utf-8');

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Entradas de un zip (nombre → contenido descomprimido), leídas desde el directorio central. */
async function unzip(buffer: ArrayBuffer, wanted: (name: string) => boolean) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('El archivo no es un Excel .xlsx válido.');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compressed);
    files.set(name, method === 0 ? raw : method === 8 ? await inflate(raw) : new Uint8Array());
  }
  return files;
}

const xml = (data: Uint8Array | undefined) =>
  new DOMParser().parseFromString(data ? textDecoder.decode(data) : '<x/>', 'application/xml');
const byTag = (node: Document | Element, tag: string) => [...node.getElementsByTagName(tag)];
const columnIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(buffer: ArrayBuffer): Promise<Hoja[]> {
  const files = await unzip(
    buffer,
    (name) => (name.startsWith('xl/') && name.endsWith('.xml')) || name.endsWith('.rels'),
  );
  const shared = byTag(xml(files.get('xl/sharedStrings.xml')), 'si').map((si) =>
    byTag(si, 't')
      .map((t) => t.textContent ?? '')
      .join(''),
  );
  const workbook = xml(files.get('xl/workbook.xml'));
  const rels = xml(files.get('xl/_rels/workbook.xml.rels'));
  const target = new Map(
    byTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']),
  );
  const sheets: Hoja[] = [];
  for (const sheet of byTag(workbook, 'sheet')) {
    const rid =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      );
    let path = target.get(rid) ?? '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path.replace(/^\.\//, '')}`;
    const doc = xml(files.get(path));
    const rows: string[][] = [];
    for (const row of byTag(doc, 'row')) {
      const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
      const cells: string[] = [];
      for (const c of byTag(row, 'c')) {
        const type = c.getAttribute('t');
        const v = byTag(c, 'v')[0]?.textContent ?? '';
        const value =
          type === 's'
            ? (shared[Number(v)] ?? '')
            : type === 'inlineStr'
              ? byTag(c, 't')
                  .map((t) => t.textContent ?? '')
                  .join('')
              : type === 'b'
                ? v === '1'
                  ? 'VERDADERO'
                  : 'FALSO'
                : v;
        cells[columnIndex(c.getAttribute('r') ?? 'A')] = value.trim();
      }
      rows[r] = Array.from(cells, (x) => x ?? '');
    }
    sheets.push({
      nombre: sheet.getAttribute('name') ?? `Hoja ${sheets.length + 1}`,
      filas: Array.from(rows, (x) => x ?? []),
    });
  }
  return sheets;
}

/** CSV con «;», «,» o tabulador (se detecta en la primera línea), comillas dobles y BOM. */
export function readDelimited(text: string): Hoja[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const first = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return [{ nombre: 'CSV', filas: rows }];
}

export async function readSpreadsheet(file: File): Promise<Hoja[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.csv') || name.endsWith('.txt')) return readDelimited(await file.text());
  if (name.endsWith('.xls'))
    throw new Error('Es un Excel antiguo (.xls). Ábrelo en Excel y guárdalo como .xlsx o .csv.');
  throw new Error('Formato no reconocido. Usa un archivo .xlsx o .csv.');
}

export async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
