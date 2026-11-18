import { env } from '@/config/env';
import { ApiError } from '@/lib/api';

export async function management<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${env.VITE_API_BASE_URL}/gestion${path}`, {
    method,
    credentials: 'same-origin',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
    headers: {
      Accept: 'application/json',
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Bagua-Request': '1' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const fields = body?.error?.fields
      ?.map((f: { path: string; message: string }) => `${f.path}: ${f.message}`)
      .join(' · ');
    const importErrors = body?.errores
      ?.map((f: { fila: number; mensaje: string }) => `Fila ${f.fila}: ${f.mensaje}`)
      .join(' · ');
    throw new ApiError(
      response.status,
      fields || importErrors || body?.error?.message || 'No se pudo completar la solicitud.',
    );
  }
  return body as T;
}
export interface User {
  id: string;
  nombre: string;
  usuario: string;
  rol: 'administrador' | 'registro' | 'consulta';
}
export interface Predio {
  archivado: boolean;
  motivo_archivo: string | null;
  id: string;
  codigo: string;
  direccion: string;
  sector: string | null;
  uso: string | null;
  observaciones: string;
  version: number;
  fuente: string;
  fuente_codigo: string;
  sintetica: boolean;
  ubicacion: { type: 'Point'; coordinates: [number, number] } | null;
  estado_ubicacion: string;
  evidencia_ubicacion: string;
  actualizado_en: string;
}
export interface Person {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
}
export interface Period {
  id: string;
  desde: string;
  hasta: string | null;
  evidencia: string;
  nombre: string;
}
export interface Participation extends Period {
  servicio_id: string;
}
export interface Delivery {
  version: number;
  id: string;
  fecha: string;
  material: string;
  cantidad: string | null;
  unidad: string | null;
  anulada: boolean;
  motivo_anulacion: string | null;
  servicio: string;
  observaciones: string;
}
export interface Detail {
  predio: Predio;
  personas: (Person & Period & { tipo_persona: string; persona_id: string })[];
  asignaciones: (Period & { estado: string; servicio_id: string })[];
  participaciones: Participation[];
  entregas: Delivery[];
  historial: { id: string; accion: string; creado_en: string; responsable: string }[];
  personasPermitidas: boolean;
}
export const localDay = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const showDay = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', dateStyle: 'medium' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00Z`),
  );
