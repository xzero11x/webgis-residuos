import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// QR en SVG (nítido al imprimir). Corrección de errores «M»: tolera ~15 % de sticker dañado.
export function QrCode({
  value,
  size = 160,
  title,
}: {
  value: string;
  size?: number;
  title?: string;
}) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d, view: count + 8 };
  }, [value]);
  return (
    <svg
      className="qr-svg"
      viewBox={`0 0 ${path.view} ${path.view}`}
      width={size}
      height={size}
      role="img"
      aria-label={title ?? 'Código QR'}
      shapeRendering="crispEdges"
    >
      <rect width={path.view} height={path.view} fill="#ffffff" />
      <path d={path.d} fill="#0b1220" />
    </svg>
  );
}
