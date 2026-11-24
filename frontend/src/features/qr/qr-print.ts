import qrcode from 'qrcode-generator';
import { formatCode, qrUrl } from './codigo-qr';

// Hoja de stickers para imprimir (A4, 3 columnas). Se abre en una ventana aparte para no arrastrar
// la interfaz de la aplicación; cada etiqueta lleva el QR, el código y la dirección.
export interface Label {
  codigo: string;
  direccion: string;
  sector: string | null;
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c]!);

export function labelSvg(code: string) {
  const qr = qrcode(0, 'M');
  qr.addData(qrUrl(code));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function printLabels(labels: Label[]) {
  const cells = labels
    .map(
      (label) => `<div class="et">
        <div class="cab">WEBGIS BAGUA · Recolección de residuos</div>
        ${labelSvg(label.codigo)}
        <div class="cod">${formatCode(label.codigo)}</div>
        <div class="dir">${escape(label.direccion)}${label.sector ? ` · ${escape(label.sector)}` : ''}</div>
        <div class="pie">Escanea para ver qué día y a qué hora pasa el camión</div>
      </div>`,
    )
    .join('');
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Stickers QR · WEBGIS BAGUA</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { margin: 0; font-family: system-ui, sans-serif; color: #0b1220; }
      .hoja { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
      .et { display: grid; justify-items: center; gap: 1.5mm; padding: 4mm; border: 0.3mm dashed #94a3b8;
            border-radius: 3mm; break-inside: avoid; text-align: center; }
      .et svg { width: 38mm; height: 38mm; }
      .cab { font-size: 7.5pt; font-weight: 700; letter-spacing: .02em; }
      .cod { font: 700 13pt ui-monospace, monospace; letter-spacing: .08em; }
      .dir { font-size: 8pt; }
      .pie { font-size: 6.5pt; color: #475569; }
    </style></head><body><div class="hoja">${cells}</div>
    <script>window.onload = function () { window.print(); };</script></body></html>`);
  win.document.close();
}
