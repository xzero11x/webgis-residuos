import { useEffect, useSyncExternalStore } from 'react';
import { ApiError } from '@/lib/api';

// Cola de envíos sin conexión. En la calle la señal se corta: lo que el chofer o el promotor
// registran se guarda en el teléfono y se envía solo cuando vuelve la conexión. Cada registro lleva
// su clave única, así que el servidor no lo duplica aunque llegue dos veces.

export interface QueuedItem {
  id: string;
  path: string;
  body: unknown;
  /** Texto para la persona: «Paso por Jr. Arica · 07:42». */
  label: string;
  /** Agrupa registros de una misma ruta o recorrido (para mostrarlos como hechos). */
  grupo: string;
  creado: number;
  intentos: number;
  error?: string;
}
interface State {
  pendientes: QueuedItem[];
  rechazados: QueuedItem[];
  enviando: boolean;
}

const KEY = 'bagua-cola-envios-v1';
let state: State = { pendientes: [], rechazados: [], enviando: false };
const listeners = new Set<() => void>();

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      return {
        pendientes: Array.isArray(parsed.pendientes) ? parsed.pendientes : [],
        rechazados: Array.isArray(parsed.rechazados) ? parsed.rechazados.slice(-20) : [],
        enviando: false,
      };
    }
  } catch {
    /* almacenamiento no disponible: la cola vive solo en memoria */
  }
  return { pendientes: [], rechazados: [], enviando: false };
}
function write(next: State) {
  state = next;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ pendientes: next.pendientes, rechazados: next.rechazados }),
    );
  } catch {
    /* sin almacenamiento: se intenta igual mientras la página siga abierta */
  }
  listeners.forEach((listener) => listener());
}
if (typeof window !== 'undefined') state = read();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const snapshot = () => state;

export function enqueue(item: Omit<QueuedItem, 'creado' | 'intentos'>) {
  if (state.pendientes.some((p) => p.id === item.id)) return;
  write({
    ...state,
    pendientes: [...state.pendientes, { ...item, creado: Date.now(), intentos: 0 }],
  });
}
export function dismissRejected(id: string) {
  write({ ...state, rechazados: state.rechazados.filter((r) => r.id !== id) });
}

/** ¿El error indica que no hubo conexión (y conviene reintentar)? */
export function isOffline(error: unknown) {
  // 401: la sesión venció; el registro espera a que la persona vuelva a ingresar.
  if (error instanceof ApiError)
    return error.status >= 500 || error.status === 408 || error.status === 401;
  return true; // TypeError de red, tiempo agotado o servidor inalcanzable
}

let running: Promise<void> | null = null;
/** Envía la cola en orden. Se detiene al primer corte de conexión; un rechazo (4xx) se aparta. */
export function flush(send: (path: string, body: unknown) => Promise<unknown>) {
  if (running) return running;
  running = (async () => {
    write({ ...state, enviando: true });
    try {
      while (state.pendientes.length) {
        const item = state.pendientes[0]!;
        try {
          await send(item.path, item.body);
          write({ ...state, pendientes: state.pendientes.slice(1) });
        } catch (error) {
          if (isOffline(error)) {
            write({
              ...state,
              pendientes: [{ ...item, intentos: item.intentos + 1 }, ...state.pendientes.slice(1)],
            });
            break;
          }
          write({
            ...state,
            pendientes: state.pendientes.slice(1),
            rechazados: [
              ...state.rechazados,
              {
                ...item,
                error: error instanceof Error ? error.message : 'Rechazado por el servidor.',
              },
            ].slice(-20),
          });
        }
      }
    } finally {
      write({ ...state, enviando: false });
      running = null;
    }
  })();
  return running;
}

/** Estado de la cola y reintento automático: al volver la señal y cada 30 s mientras haya pendientes. */
export function useQueue(send: (path: string, body: unknown) => Promise<unknown>) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const pending = current.pendientes.length;
  useEffect(() => {
    const retry = () => void flush(send);
    window.addEventListener('online', retry);
    const timer = pending ? window.setInterval(retry, 30_000) : undefined;
    if (pending && navigator.onLine) retry();
    return () => {
      window.removeEventListener('online', retry);
      if (timer) window.clearInterval(timer);
    };
  }, [pending, send]);
  return current;
}
