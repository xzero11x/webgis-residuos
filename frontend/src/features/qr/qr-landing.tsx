import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPinned } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { ServiceSchedule } from '@/features/bagua-master/components/service-schedule';
import type { ServiceAtPoint } from '@/features/bagua-master/types';
import { useSession } from '@/features/product/use-session';
import { formatCode, isValidCode, normalizeCode } from './codigo-qr';
import './qr.css';

// Lo que abre el sticker de la puerta. Para el vecino: qué servicio pasa y a qué hora (sin datos
// personales). Para el promotor con sesión: acceso directo al registro de la visita.
export function QrLandingPage() {
  const { codigo = '' } = useParams();
  const code = normalizeCode(codigo);
  const valid = isValidCode(code);
  const session = useSession();
  const query = useQuery({
    queryKey: ['bagua-master', 'qr', code],
    queryFn: ({ signal }) =>
      apiGet(`/bagua-master/qr/${code}`, signal) as Promise<{
        codigo: string;
        activo: boolean;
        sector: string | null;
        servicios: ServiceAtPoint[];
      }>,
    enabled: valid,
    retry: false,
  });
  const worker = session.isSuccess && session.data.rol !== 'consulta';
  return (
    <main className="qr-landing">
      <header>
        <span className="qr-landing-marca" aria-hidden="true">
          <MapPinned size={18} />
        </span>
        <div>
          <strong>WEBGIS BAGUA</strong>
          <small>Municipalidad Provincial de Bagua · Gestión Ambiental</small>
        </div>
      </header>
      <section className="qr-landing-card" data-testid="qr-landing">
        <p className="qr-landing-codigo">Punto de recolección {valid ? formatCode(code) : ''}</p>
        {!valid ? (
          <p role="alert">Este código no es válido. Revisa el sticker.</p>
        ) : query.isPending ? (
          <p role="status">Consultando el horario…</p>
        ) : query.isError || !query.data ? (
          <p role="alert">Este código no está registrado.</p>
        ) : !query.data.activo ? (
          <p role="alert">
            Este sticker fue reemplazado por uno nuevo. Pide a la Municipalidad el sticker vigente.
          </p>
        ) : (
          <>
            <h1>¿Cuándo pasa el camión?</h1>
            {query.data.sector && <p className="qr-landing-sector">Sector {query.data.sector}</p>}
            <ServiceSchedule services={query.data.servicios} />
            <p className="qr-landing-nota">
              Saca tus residuos poco antes de la hora indicada. Los orgánicos y los reciclables van
              separados.
            </p>
          </>
        )}
        {worker && valid && query.data?.activo && (
          <Link
            className="qr-landing-accion"
            to={`/bagua-master/campo?qr=${code}`}
            data-testid="qr-registrar"
          >
            Registrar visita
          </Link>
        )}
      </section>
    </main>
  );
}

export { QrLandingPage as Component };
