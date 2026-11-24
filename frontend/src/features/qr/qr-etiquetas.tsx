import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, QrCode as QrIcon } from 'lucide-react';
import { management, type User } from '@/features/gestion/api';
import { SessionGate } from '@/features/product/session';
import { formatCode, qrUrl } from './codigo-qr';
import { QrCode } from './qr-code';
import { printLabels } from './qr-print';
import './qr.css';

// Stickers QR de los inscritos: generar los que faltan e imprimir la hoja por programa y sector.
type Kind = 'todos' | 'organicos' | 'reciclables';
interface Labels {
  etiquetas: {
    codigo: string;
    predioId: string;
    predioCodigo: string;
    direccion: string;
    sector: string | null;
    padron: string | null;
  }[];
  sinCodigo: number;
}

export function QrEtiquetasPage() {
  return <SessionGate>{(user) => <Etiquetas user={user} />}</SessionGate>;
}

function Etiquetas({ user }: { user: User }) {
  const [kind, setKind] = useState<Kind>('todos');
  const [sector, setSector] = useState('');
  const client = useQueryClient();
  const params = new URLSearchParams({ servicio: kind, ...(sector ? { sector } : {}) });
  const query = useQuery({
    queryKey: ['gestion', 'qr-etiquetas', params.toString()],
    queryFn: ({ signal }) =>
      management<Labels>(`/qr/etiquetas?${params}`, 'GET', undefined, signal),
  });
  const batch = useMutation({
    mutationFn: () => management<{ generados: number }>('/qr/lote', 'POST', { servicio: kind }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['gestion', 'qr-etiquetas'] }),
  });
  const labels = query.data?.etiquetas ?? [];
  const sectors = [...new Set(labels.map((l) => l.sector).filter(Boolean))].sort() as string[];
  return (
    <div className="pr-page pr-embed">
      <div className="pr-container">
        <header className="pr-page-head">
          <div>
            <p className="pr-eyebrow">Campo · stickers</p>
            <h1>Stickers QR de los inscritos</h1>
            <p>
              Cada sticker lleva solo un código: el vecino ve su horario de recolección y el
              promotor registra la visita al escanearlo.{' '}
              <Link to="/bagua-master/campo">Volver a Campo</Link>
            </p>
          </div>
        </header>
        <div className="pr-toolbar qr-toolbar">
          <div className="pr-segmented" role="group" aria-label="Programa">
            {(['todos', 'organicos', 'reciclables'] as Kind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === 'todos' ? 'Todos' : k === 'organicos' ? 'Orgánicos' : 'Reciclables'}
              </button>
            ))}
          </div>
          <select
            aria-label="Sector"
            value={sector}
            onChange={(event) => setSector(event.target.value)}
          >
            <option value="">Todos los sectores</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="qr-boton"
            disabled={!labels.length}
            onClick={() => printLabels(labels)}
            data-testid="qr-imprimir"
          >
            <Printer size={15} aria-hidden="true" /> Imprimir {labels.length} stickers
          </button>
        </div>
        {query.data && query.data.sinCodigo > 0 && user.rol !== 'consulta' && (
          <div className="qr-faltan" role="status">
            <QrIcon size={16} aria-hidden="true" />
            <span>{query.data.sinCodigo} inscritos aún no tienen sticker.</span>
            <button
              type="button"
              className="qr-boton is-primary"
              disabled={batch.isPending}
              onClick={() => batch.mutate()}
              data-testid="qr-lote"
            >
              {batch.isPending ? 'Generando…' : 'Generar los que faltan'}
            </button>
          </div>
        )}
        {query.isPending && <p role="status">Cargando stickers…</p>}
        <ul className="qr-grilla" data-testid="qr-grilla">
          {labels.slice(0, 60).map((l) => (
            <li key={l.codigo}>
              <QrCode value={qrUrl(l.codigo)} size={96} title={`QR ${formatCode(l.codigo)}`} />
              <strong className="pr-mono">{formatCode(l.codigo)}</strong>
              <Link to={`/bagua-master/expedientes/predio/${l.predioId}`}>{l.direccion}</Link>
              <span>
                {l.sector} · {l.padron}
              </span>
            </li>
          ))}
        </ul>
        {labels.length > 60 && (
          <p className="pr-muted">Se muestran 60 de {labels.length}; la impresión incluye todos.</p>
        )}
      </div>
    </div>
  );
}

export { QrEtiquetasPage as Component };
