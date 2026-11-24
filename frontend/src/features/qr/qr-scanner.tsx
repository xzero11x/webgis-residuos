import { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, X } from 'lucide-react';
import { codeFromScan, isValidCode, normalizeCode } from './codigo-qr';
import './qr.css';

// Lector de stickers QR con la cámara trasera. Usa el lector nativo del navegador
// (BarcodeDetector) cuando existe y, si no, jsQR sobre los cuadros del video. Si la cámara no
// está disponible o el sticker está dañado, se escribe el código impreso debajo del QR.

interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

export function QrScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string, via: 'qr' | 'codigo') => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [hint, setHint] = useState('Apunta la cámara al sticker');
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Escribe el código del sticker.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
        setError(
          (e as Error).name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara para escanear, o escribe el código del sticker.'
            : 'No se pudo abrir la cámara. Escribe el código del sticker.',
        );
        return;
      }
      if (cancelled || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const native = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ['qr_code'] })
        : null;
      const decode = native ? null : (await import('jsqr')).default;
      const tick = async () => {
        if (cancelled || done.current || !video.current) return;
        const v = video.current;
        let text = '';
        if (v.readyState >= 2) {
          if (native) {
            text = (await native.detect(v).catch(() => []))[0]?.rawValue ?? '';
          } else if (decode && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text =
              decode(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
                ?.data ?? '';
          }
        }
        if (text) {
          const code = codeFromScan(text);
          if (isValidCode(code)) {
            done.current = true;
            navigator.vibrate?.(60);
            onCode(code, 'qr');
            return;
          }
          setHint('Ese QR no es un sticker de WEBGIS BAGUA');
        }
        timer = window.setTimeout(() => void tick(), native ? 120 : 220);
      };
      void tick();
    }
    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  const manualCode = normalizeCode(manual);
  const manualValid = isValidCode(manualCode);
  return (
    <div
      className="qr-scan"
      role="dialog"
      aria-modal="true"
      aria-label="Escanear sticker QR"
      data-testid="qr-scanner"
    >
      <div className="qr-scan-panel">
        <header>
          <strong>
            <Camera size={16} aria-hidden="true" /> Escanear sticker
          </strong>
          <button type="button" onClick={onClose} aria-label="Cerrar escáner">
            <X size={18} />
          </button>
        </header>
        {error ? (
          <p className="qr-scan-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="qr-scan-video">
            <video ref={video} playsInline muted />
            <span className="qr-scan-marco" aria-hidden="true" />
            <span className="qr-scan-hint" role="status">
              {hint}
            </span>
          </div>
        )}
        <form
          className="qr-scan-manual"
          onSubmit={(event) => {
            event.preventDefault();
            if (manualValid) onCode(manualCode, 'codigo');
          }}
        >
          <label htmlFor="qr-manual">
            <Keyboard size={14} aria-hidden="true" /> O escribe el código impreso
          </label>
          <div>
            <input
              id="qr-manual"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="XXXX-XXXX"
              maxLength={9}
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              aria-invalid={manual.length >= 8 && !manualValid}
            />
            <button type="submit" disabled={!manualValid}>
              Abrir
            </button>
          </div>
          {manual.length >= 8 && !manualValid && (
            <span className="qr-scan-error">Revisa el código: algún carácter no coincide.</span>
          )}
        </form>
      </div>
    </div>
  );
}
