import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { CheckCircle2, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { management } from '@/features/gestion/api';
import { loadMapRuntime } from '@/features/bagua-master/map/runtime';
import { buildStyle } from '@/features/bagua-master/map/style';
import { CENTER } from '@/features/bagua-master/config';
import { Sheet } from '@/features/product/sheet';
import { QrCode } from '@/features/qr/qr-code';
import { enqueue, isOffline } from '@/lib/cola-envios';
import './padron.css';

// Empadronamiento corto en campo: el promotor marca la vivienda en el mapa (o la elige si ya existe),
// anota al representante, elige el programa, el vecino acepta el uso de sus datos y sale el código
// del padrón con su sticker. Un formulario, sin pasos ocultos, pensado para el celular.

type Kind = 'organicos' | 'reciclables';
type Generator = 'domiciliario' | 'no_domiciliario';
interface Existing {
  id: string;
  codigo: string;
  direccion: string;
}
interface Result {
  predioCodigo: string;
  codigoPadron: string;
  sticker: string | null;
  repetido?: boolean;
}
const CONSENT_TEXT =
  'Autorizo a la Municipalidad Provincial de Bagua a registrar mi nombre, DNI y dirección solo para el programa de segregación de residuos y su recolección. Puedo pedir que se corrijan o eliminen en la Gerencia de Gestión Ambiental (Ley 29733).';

export function Empadronar({
  open,
  onClose,
  initialKind,
}: {
  open: boolean;
  onClose: () => void;
  initialKind: Kind;
}) {
  return (
    <Sheet
      open={open}
      title="Inscribir vecino"
      description="Empadronamiento en el programa de segregación"
      onClose={onClose}
    >
      {open && <EnrollForm initialKind={initialKind} onClose={onClose} />}
    </Sheet>
  );
}

function EnrollForm({ initialKind, onClose }: { initialKind: Kind; onClose: () => void }) {
  const client = useQueryClient();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [generator, setGenerator] = useState<Generator>('domiciliario');
  const [point, setPoint] = useState<{ lon: number; lat: number; edificio: string | null } | null>(
    null,
  );
  // null = lo que corresponde por defecto (el predio de la edificación si existe, si no uno nuevo).
  const [choice, setChoice] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [queued, setQueued] = useState(false);
  const [clave] = useState(() => crypto.randomUUID());
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);

  const linked = useQuery({
    queryKey: ['gestion', 'edificio-predios', point?.edificio],
    queryFn: ({ signal }) =>
      management<{ items: (Existing & { archivado: boolean })[] }>(
        `/espacial/edificios/${encodeURIComponent(point!.edificio!)}/predios`,
        'GET',
        undefined,
        signal,
      ),
    enabled: !!point?.edificio,
  });
  const existing = (linked.data?.items ?? []).filter((p) => !p.archivado);
  const chosen = choice ?? existing[0]?.id ?? 'nuevo';
  const setChosen = setChoice;

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let disposed = false;
    let cleanup = () => {};
    void loadMapRuntime().then((maplibre) => {
      if (disposed) return;
      const instance = new maplibre.Map({
        container: node,
        style: buildStyle('positron'),
        center: CENTER,
        zoom: 16.5,
        attributionControl: false,
        fadeDuration: 0,
      });
      instance.on('click', (event) => {
        const hit = instance.queryRenderedFeatures(event.point, { layers: ['bm-edificios'] })[0];
        const id = (hit?.properties?.id as string | undefined) ?? null;
        setPoint({ lon: event.lngLat.lng, lat: event.lngLat.lat, edificio: id });
        setChoice(null);
        if (!marker.current) {
          const pin = document.createElement('div');
          pin.className = 'em-pin';
          marker.current = new maplibre.Marker({ element: pin });
        }
        marker.current.setLngLat(event.lngLat).addTo(instance);
      });
      map.current = instance;
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(node);
      cleanup = () => {
        observer.disconnect();
        instance.remove();
        map.current = null;
        marker.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => map.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 18.5 }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      management<Result>('/empadronamiento', 'POST', body),
    onSuccess: (data) => {
      setResult(data);
      void client.invalidateQueries({ queryKey: ['gestion'] });
    },
    onError: (error, body) => {
      if (isOffline(error)) {
        enqueue({
          id: clave,
          grupo: 'empadronamiento',
          path: '/empadronamiento',
          label: `Inscripción de ${String((body.representante as { nombre: string }).nombre)}`,
          body,
        });
        setQueued(true);
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!point) return;
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    save.mutate({
      clave,
      servicio: kind,
      tipoGenerador: generator,
      predioId: chosen !== 'nuevo' ? chosen : null,
      nuevoPredio:
        chosen === 'nuevo'
          ? {
              direccion: text('direccion'),
              sector: text('sector'),
              edificioId: point.edificio,
              lon: point.lon,
              lat: point.lat,
            }
          : null,
      representante: { nombre: text('nombre'), dni: text('dni') },
      habitantes:
        generator === 'domiciliario' && text('habitantes') ? Number(text('habitantes')) : null,
      establecimiento: generator === 'no_domiciliario' ? text('establecimiento') : '',
      tipoEstablecimiento: generator === 'no_domiciliario' ? text('tipoEstablecimiento') : '',
      consentimiento: true,
      sticker: 'generar',
    });
  }

  if (result)
    return (
      <div className="em-listo" data-testid="em-listo">
        <CheckCircle2 size={32} color="#15803d" aria-hidden="true" />
        <strong>Inscrito con el código {result.codigoPadron}</strong>
        <span>Predio {result.predioCodigo}</span>
        {result.sticker && (
          <>
            <QrCode
              value={`${window.location.origin}/bagua-master/q/${result.sticker}`}
              size={150}
              title={`Sticker ${result.sticker}`}
            />
            <span className="pr-mono">
              {result.sticker.slice(0, 4)}-{result.sticker.slice(4)}
            </span>
            <span className="op-nota">
              Pega un sticker con este código en la puerta, o imprímelo después desde Campo ›
              Stickers.
            </span>
          </>
        )}
        <Button onClick={onClose}>Listo</Button>
      </div>
    );
  if (queued)
    return (
      <div className="em-listo">
        <strong>Inscripción guardada en el teléfono</strong>
        <span className="op-nota">
          No hay señal. Se enviará sola al volver la conexión; el código de padrón y el sticker
          aparecerán en el expediente del predio.
        </span>
        <Button onClick={onClose}>Entendido</Button>
      </div>
    );

  return (
    <form className="em" onSubmit={submit} data-testid="em-form">
      <section>
        <p className="op-subtitulo">1. Toca la vivienda en el mapa</p>
        <div
          className="em-mapa"
          ref={element}
          role="application"
          aria-label="Mapa para marcar la vivienda"
        />
        <Button type="button" variant="ghost" size="sm" onClick={locate}>
          <LocateFixed size={14} aria-hidden="true" /> Ir a mi ubicación
        </Button>
        {point && existing.length > 0 && (
          <fieldset className="op-checks">
            <legend>Esta edificación ya tiene predio</legend>
            {existing.map((p) => (
              <label key={p.id}>
                <input
                  type="radio"
                  name="predio"
                  checked={chosen === p.id}
                  onChange={() => setChosen(p.id)}
                />
                {p.codigo} · {p.direccion}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="predio"
                checked={chosen === 'nuevo'}
                onChange={() => setChosen('nuevo')}
              />
              Es otra vivienda o local
            </label>
          </fieldset>
        )}
        {point && chosen === 'nuevo' && (
          <div className="op-form-grid">
            <label>
              Dirección
              <input
                className="pr-field"
                name="direccion"
                required
                minLength={4}
                maxLength={200}
                placeholder="Jr. Amazonas 345"
              />
            </label>
            <label>
              Sector
              <input className="pr-field" name="sector" maxLength={80} placeholder="Cercado" />
            </label>
          </div>
        )}
      </section>
      <section>
        <p className="op-subtitulo">2. Programa</p>
        <div className="pd-paso">
          <div className="pr-segmented" role="group" aria-label="Programa">
            {(['organicos', 'reciclables'] as Kind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === 'organicos' ? 'Orgánicos' : 'Reciclables'}
              </button>
            ))}
          </div>
          <div className="pr-segmented" role="group" aria-label="Tipo">
            {(['domiciliario', 'no_domiciliario'] as Generator[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={generator === g}
                onClick={() => setGenerator(g)}
              >
                {g === 'domiciliario' ? 'Vivienda' : 'Negocio o institución'}
              </button>
            ))}
          </div>
        </div>
        {generator === 'domiciliario' ? (
          <label>
            Personas que viven ahí
            <input
              className="pr-field"
              name="habitantes"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
            />
          </label>
        ) : (
          <div className="op-form-grid">
            <label>
              Nombre del establecimiento
              <input
                className="pr-field"
                name="establecimiento"
                required
                minLength={3}
                maxLength={160}
              />
            </label>
            <label>
              Tipo
              <input
                className="pr-field"
                name="tipoEstablecimiento"
                maxLength={80}
                placeholder="Bodega, restaurante…"
              />
            </label>
          </div>
        )}
      </section>
      <section>
        <p className="op-subtitulo">3. Representante</p>
        <div className="op-form-grid">
          <label>
            Nombre y apellidos
            <input
              className="pr-field"
              name="nombre"
              required
              minLength={5}
              maxLength={160}
              autoComplete="off"
            />
          </label>
          <label>
            DNI
            <input
              className="pr-field"
              name="dni"
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              autoComplete="off"
            />
          </label>
        </div>
      </section>
      <label className="em-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          required
        />
        <span>{CONSENT_TEXT}</span>
      </label>
      {save.isError && !queued && (
        <p role="alert" className="pr-error">
          {save.error instanceof Error ? save.error.message : 'No se pudo inscribir.'}
        </p>
      )}
      <div className="pr-actions">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!point || !consent || save.isPending}
          data-testid="em-inscribir"
        >
          Inscribir
        </Button>
      </div>
      {!point && <p className="op-nota">Primero toca la vivienda en el mapa.</p>}
    </form>
  );
}
