import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserX, X } from 'lucide-react';
import { management } from '@/features/gestion/api';
import { DeliveryForm, type Kind } from '@/features/product/delivery-form';
import { formatCode } from './codigo-qr';
import './qr.css';

// Registro de la visita tras escanear el sticker: el predio, sus programas (con el del día
// destacado) y la visita en uno o dos toques. La visita queda marcada con su origen (QR o código).
type Result = 'entrego' | 'no_entrego' | 'ausente';
interface Scan {
  codigo: string;
  fecha: string;
  predio: { id: string; codigo: string; direccion: string; sector: string | null };
  participaciones: {
    participacionId: string;
    servicio: string;
    codigoPadron: string | null;
    establecimiento: string | null;
    tipo: Kind | null;
    programadoHoy: boolean;
    horaEstimada: string | null;
    visitaId: string | null;
    resultado: Result | null;
    entregas: { material: string; cantidad: number | null }[];
  }[];
}
const LABEL: Record<Result, string> = {
  entrego: 'Entregó',
  no_entrego: 'No entregó',
  ausente: 'Ausente',
};

export function QrVisit({
  code,
  date,
  via,
  onClose,
  onSaved,
}: {
  code: string;
  date: string;
  via: 'qr' | 'codigo';
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const key = ['gestion', 'qr-visita', code, date];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      management<Scan>(`/qr/${code}?fecha=${date}`, 'GET', undefined, signal),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (body: {
      participacionId: string;
      resultado: Result;
      entregas: { material: string; cantidad: number | null }[];
    }) =>
      management('/visitas', 'POST', {
        clave: crypto.randomUUID(),
        fecha: date,
        origen: via,
        observaciones: '',
        ...body,
      }),
    onSuccess: () => {
      setOpen(null);
      void client.invalidateQueries({ queryKey: key });
      onSaved();
    },
  });
  const data = query.data;
  return (
    <section className="qr-visita" aria-label="Visita por sticker QR" data-testid="qr-visita">
      <header>
        <div>
          <p className="pr-eyebrow">
            Sticker {formatCode(code)} · {via === 'qr' ? 'escaneado' : 'código escrito'}
          </p>
          <strong>{data?.predio.direccion ?? 'Buscando el predio…'}</strong>
          {data && (
            <span>
              {data.predio.codigo}
              {data.predio.sector ? ` · ${data.predio.sector}` : ''} ·{' '}
              <Link to={`/bagua-master/expedientes/predio/${data.predio.id}`}>Expediente</Link>
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar visita por QR">
          <X size={18} />
        </button>
      </header>
      {query.isError && (
        <p role="alert" className="cp-error">
          {query.error instanceof Error ? query.error.message : 'No se pudo leer el sticker.'}
        </p>
      )}
      {data && data.participaciones.length === 0 && (
        <p className="pr-muted">
          Este predio no participa en ningún programa selectivo en esta fecha.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="cp-error">
          {save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}
        </p>
      )}
      <ul className="qr-visita-lista">
        {data?.participaciones.map((p) => (
          <li key={p.participacionId} className={p.programadoHoy ? 'is-hoy' : ''}>
            <div className="qr-visita-programa">
              <strong>{p.servicio}</strong>
              <span>
                {p.codigoPadron}
                {p.establecimiento ? ` · ${p.establecimiento}` : ''}
                {p.programadoHoy
                  ? ` · toca hoy${p.horaEstimada ? `, aprox. ${p.horaEstimada}` : ''}`
                  : ' · no toca en esta fecha'}
              </span>
            </div>
            {p.resultado ? (
              <span className={`pr-chip ${p.resultado === 'entrego' ? 'is-violet' : ''}`}>
                {LABEL[p.resultado]}
                {p.entregas.length
                  ? ` · ${p.entregas.map((e) => (e.cantidad ? `${e.material} ${e.cantidad} kg` : e.material)).join(', ')}`
                  : ''}
              </span>
            ) : open === p.participacionId && p.tipo ? (
              <DeliveryForm
                kind={p.tipo}
                saving={save.isPending}
                onCancel={() => setOpen(null)}
                onSave={(entregas) =>
                  save.mutate({
                    participacionId: p.participacionId,
                    resultado: 'entrego',
                    entregas,
                  })
                }
              />
            ) : (
              <div className="cp-acciones">
                <button type="button" className="is-ok" onClick={() => setOpen(p.participacionId)}>
                  <Check size={16} aria-hidden="true" /> Entregó
                </button>
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      participacionId: p.participacionId,
                      resultado: 'no_entrego',
                      entregas: [],
                    })
                  }
                >
                  <X size={16} aria-hidden="true" /> No entregó
                </button>
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      participacionId: p.participacionId,
                      resultado: 'ausente',
                      entregas: [],
                    })
                  }
                >
                  <UserX size={16} aria-hidden="true" /> Ausente
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
