// Tipos y utilidades compartidas por la operación del servicio (chofer, supervisor, pesaje, avisos).

export type Servicio = 'convencional' | 'organicos' | 'reciclables' | 'comercial';
export type Destino = 'relleno' | 'planta' | 'acopio';
export type EstadoEjecucion = 'en_curso' | 'completada' | 'interrumpida';
export type Situacion =
  | EstadoEjecucion
  | 'pendiente'
  | 'por_iniciar'
  | 'sin_iniciar'
  | 'no_ejecutada'
  | 'programada'
  | 'suspendida';

export interface PuntoControl {
  id: string;
  orden: number;
  nombre: string;
  hora: string;
  lon: number;
  lat: number;
}
export interface EventoRuta {
  id: string;
  tipo: 'salida' | 'paso' | 'llegada';
  momento: string;
  puntoId: string | null;
  destino: Destino | null;
  pendiente?: boolean;
}
export interface ProgramaDia {
  id: string;
  ruta: string;
  rutaNombre: string;
  color: string;
  servicio: Servicio;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  vehiculo: string;
  vehiculoPlaca: string | null;
  operador: string;
  sectores: string[];
  destino: Destino;
  puntos: PuntoControl[];
  ejecucion: {
    id: string;
    estado: EstadoEjecucion;
    conductor: string;
    motivoInterrupcion: string | null;
    eventos: EventoRuta[];
  } | null;
}
export interface Aviso {
  id: string;
  tipo: 'suspension' | 'cambio_horario' | 'informativo';
  titulo: string;
  mensaje: string;
  programaciones?: string[];
  desde: string;
  hasta: string;
  retirado?: boolean;
  motivoRetiro?: string | null;
  publicadoPor?: string | null;
  vigente?: boolean;
}

export const DESTINO_TEXTO: Record<Destino, string> = {
  relleno: 'Llegué al relleno',
  planta: 'Llegué a la planta',
  acopio: 'Llegué al centro de acopio',
};
export const DESTINO_NOMBRE: Record<Destino, string> = {
  relleno: 'relleno sanitario',
  planta: 'planta de compostaje',
  acopio: 'centro de acopio',
};
export const SERVICIO_NOMBRE: Record<Servicio, string> = {
  convencional: 'Convencional',
  organicos: 'Orgánicos',
  reciclables: 'Reciclables',
  comercial: 'Comercial',
};
export const SITUACION: Record<Situacion, { texto: string; tono: string }> = {
  completada: { texto: 'Completada', tono: 'is-ok' },
  en_curso: { texto: 'En ruta', tono: 'is-info' },
  interrumpida: { texto: 'Interrumpida', tono: 'is-danger' },
  pendiente: { texto: 'Aún no empieza', tono: '' },
  por_iniciar: { texto: 'Por salir', tono: '' },
  sin_iniciar: { texto: 'Sin salida', tono: 'is-danger' },
  no_ejecutada: { texto: 'No salió', tono: 'is-danger' },
  programada: { texto: 'Programada', tono: '' },
  suspendida: { texto: 'Suspendida', tono: 'is-warn' },
};
export const AVISO_TIPO: Record<Aviso['tipo'], string> = {
  suspension: 'Sin servicio',
  cambio_horario: 'Cambio de horario',
  informativo: 'Aviso',
};

/** Hora de Lima «HH:MM» de un instante ISO. */
export const limaTime = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
export const limaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Minutos de diferencia entre la hora real (instante ISO) y la programada «HH:MM». */
export const delayMinutes = (iso: string, planned: string) =>
  toMinutes(limaTime(iso)) - toMinutes(planned);
export const delayText = (minutes: number | null | undefined) =>
  minutes === null || minutes === undefined
    ? ''
    : Math.abs(minutes) <= 5
      ? 'a tiempo'
      : minutes > 0
        ? `${minutes} min tarde`
        : `${-minutes} min antes`;
export const delayTone = (minutes: number | null | undefined) =>
  minutes === null || minutes === undefined
    ? ''
    : Math.abs(minutes) > 30
      ? 'is-danger'
      : Math.abs(minutes) > 15
        ? 'is-warn'
        : 'is-ok';
const DAY = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
/** [1, 3, 5] → «lunes, miércoles y viernes». */
export const daysText = (days: number[]) => {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY[d - 1]!);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
};
export const longDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const month = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' }).format(d);
  const text = `${DAY[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} de ${month}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const kgText = (kg: number) =>
  kg >= 1000
    ? `${(kg / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} t`
    : `${Math.round(kg).toLocaleString('es-PE')} kg`;

/** «Recolección convencional · Ruta 1001» → «Ruta 1001»; «Recolección selectiva de orgánicos» → «Orgánicos». */
export function shortName(name: string): string;
export function shortName(name: string | null | undefined): string | null;
export function shortName(name: string | null | undefined) {
  if (!name) return null;
  const short = name
    .replace(/^Recolección convencional · /, '')
    .replace(/^Recolección selectiva de /, '')
    .replace(/^Recolección /, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
}
