import type { ServiceKind } from '../types';

// Formato del horario de recolección (etiquetas, colores, días y próxima pasada).

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  convencional: 'Convencional',
  organicos: 'Orgánicos',
  reciclables: 'Reciclables',
  comercial: 'Comercial',
};
export const SERVICE_COLOR: Record<ServiceKind, string> = {
  convencional: '#475569',
  organicos: '#16a34a',
  reciclables: '#2563eb',
  comercial: '#b45309',
};
const DAY = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_LONG = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export const formatDays = (days: number[]) =>
  days.length === 6 && !days.includes(7)
    ? 'Lunes a sábado'
    : days.length === 7
      ? 'Todos los días'
      : days.map((d) => DAY[d]).join(' · ');

/** Fecha y hora actuales en Bagua (America/Lima), sin depender de la zona del equipo. */
function limaNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday!) + 1;
  return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** «hoy», «mañana» o el día de la semana de la próxima recolección. */
export function nextPass(days: number[], until: string) {
  const now = limaNow();
  for (let offset = 0; offset < 8; offset++) {
    const weekday = ((now.weekday - 1 + offset) % 7) + 1;
    if (!days.includes(weekday)) continue;
    if (offset === 0 && now.minutes > toMinutes(until)) continue;
    return offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `el ${DAY_LONG[weekday]}`;
  }
  return '';
}

/** Punto representativo de una geometría GeoJSON (para consultar el horario de un elemento). */
export function representativePoint(geometry: unknown): [number, number] | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g?.type || !g.coordinates) return null;
  const average = (pts: number[][]) =>
    [
      pts.reduce((sum, p) => sum + p[0]!, 0) / pts.length,
      pts.reduce((sum, p) => sum + p[1]!, 0) / pts.length,
    ] as [number, number];
  switch (g.type) {
    case 'Point':
      return g.coordinates as [number, number];
    case 'LineString': {
      const line = g.coordinates as number[][];
      return line[Math.floor(line.length / 2)] as [number, number];
    }
    case 'MultiLineString': {
      const line = (g.coordinates as number[][][])[0]!;
      return line[Math.floor(line.length / 2)] as [number, number];
    }
    case 'Polygon':
      return average((g.coordinates as number[][][])[0]!.slice(0, -1));
    case 'MultiPolygon':
      return average((g.coordinates as number[][][][])[0]![0]!.slice(0, -1));
    default:
      return null;
  }
}
