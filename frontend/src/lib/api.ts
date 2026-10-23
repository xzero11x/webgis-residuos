import { env } from '@/config/env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message = `La API respondió con estado ${status}.`,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiWrite(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  data: unknown,
): Promise<unknown> {
  const response = await fetch(`${env.VITE_API_BASE_URL.replace(/\/$/, '')}${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message || 'No se pudo guardar. Intenta nuevamente.',
    );
  }
  return response.status === 204 ? undefined : response.json();
}

export async function apiGet(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${env.VITE_API_BASE_URL.replace(/\/$/, '')}${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}
