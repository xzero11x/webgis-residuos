import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, QrCode as QrIcon, RefreshCw } from 'lucide-react';
import { management, showDay } from '@/features/gestion/api';
import { formatCode, qrUrl } from './codigo-qr';
import { QrCode } from './qr-code';
import { printLabels } from './qr-print';
import './qr.css';

// Sticker QR del predio en su expediente: verlo, imprimirlo, generarlo si falta o reemplazarlo.
interface PredioQr {
  vigente: {
    codigo: string;
    generadoEn: string;
    escaneos: number;
    ultimoEscaneo: string | null;
  } | null;
  historial: { codigo: string; estado: string }[];
}

export function QrPredio({
  predioId,
  direccion,
  sector,
  editable,
}: {
  predioId: string;
  direccion: string;
  sector: string | null;
  editable: boolean;
}) {
  const client = useQueryClient();
  const [replacing, setReplacing] = useState(false);
  const [motivo, setMotivo] = useState('');
  const query = useQuery({
    queryKey: ['gestion', 'qr-predio', predioId],
    queryFn: ({ signal }) =>
      management<PredioQr>(`/predios/${predioId}/qr`, 'GET', undefined, signal),
    retry: false,
  });
  const refresh = () =>
    void client.invalidateQueries({ queryKey: ['gestion', 'qr-predio', predioId] });
  const generate = useMutation({
    mutationFn: () => management(`/predios/${predioId}/qr`, 'POST', {}),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (codigo: string) =>
      management(`/qr/${codigo}/revocar`, 'POST', { motivo, regenerar: true }),
    onSuccess: () => {
      setReplacing(false);
      setMotivo('');
      refresh();
    },
  });
  if (query.isError) return null;
  const current = query.data?.vigente;
  return (
    <section className="pr-card qr-predio" aria-labelledby="h-qr" data-testid="qr-predio">
      <h2 id="h-qr" className="qr-predio-titulo">
        Sticker QR
      </h2>
      <div className="qr-predio-cuerpo">
        {query.isPending ? (
          <p role="status">Cargando…</p>
        ) : current ? (
          <>
            <QrCode
              value={qrUrl(current.codigo)}
              size={124}
              title={`QR del predio ${formatCode(current.codigo)}`}
            />
            <div className="qr-predio-datos">
              <strong className="pr-mono" data-testid="qr-codigo">
                {formatCode(current.codigo)}
              </strong>
              <span>Entregado {showDay(current.generadoEn.slice(0, 10))}</span>
              <span>
                {current.escaneos} escaneos
                {current.ultimoEscaneo
                  ? ` · último ${showDay(current.ultimoEscaneo.slice(0, 10))}`
                  : ''}
              </span>
              <div className="qr-predio-acciones">
                <button
                  type="button"
                  onClick={() => printLabels([{ codigo: current.codigo, direccion, sector }])}
                >
                  <Printer size={14} aria-hidden="true" /> Imprimir
                </button>
                {editable && (
                  <button type="button" onClick={() => setReplacing(!replacing)}>
                    <RefreshCw size={14} aria-hidden="true" /> Reemplazar
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="qr-predio-vacio">
            <QrIcon size={22} aria-hidden="true" />
            <span>Este predio aún no tiene sticker QR.</span>
            {editable && (
              <button
                type="button"
                className="is-primary"
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
                data-testid="qr-generar"
              >
                Generar código QR
              </button>
            )}
          </div>
        )}
      </div>
      {replacing && current && (
        <form
          className="qr-predio-reemplazo"
          onSubmit={(event) => {
            event.preventDefault();
            revoke.mutate(current.codigo);
          }}
        >
          <label htmlFor="qr-motivo">
            ¿Por qué se reemplaza? El sticker anterior dejará de funcionar.
          </label>
          <input
            id="qr-motivo"
            required
            minLength={5}
            placeholder="Ej.: sticker dañado por la lluvia"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
          />
          <button
            type="submit"
            className="is-primary"
            disabled={motivo.trim().length < 5 || revoke.isPending}
          >
            Generar uno nuevo
          </button>
        </form>
      )}
    </section>
  );
}
