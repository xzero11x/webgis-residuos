import { BLOCK_COLORS, TOPONYM_COLORS } from '@/components/map/second-pass-layers';
import {
  LOT_LABEL_MIN_ZOOM,
  SECOND_PASS_LAYERS,
  type SecondPassSummary,
  type SecondPassVisibility,
} from './types';

const number = new Intl.NumberFormat('es-PE');

export function SecondPassLegend({
  summary,
  shown,
  zoom,
  truncated,
}: {
  summary?: SecondPassSummary;
  shown: SecondPassVisibility;
  zoom: number;
  truncated: boolean;
}) {
  const active = SECOND_PASS_LAYERS.filter(({ key }) => shown[key]);
  if (!active.length) return null;
  const total = (kind: string) =>
    summary?.counts.filter((c) => c.kind === kind).reduce((sum, c) => sum + c.total, 0);
  const tomaque = summary?.audit?.tomaque;
  const blocks = summary?.audit?.blocks.filter((b) => b.aceptado) ?? [];
  return (
    <details className="cartography-legend second-pass-legend" open={window.innerWidth >= 768}>
      <summary>
        Segunda pasada DWG <span>Por revisar</span>
      </summary>
      <div className="legend-items">
        {active.map(({ key, label }) => (
          <p key={key}>
            <i className={`second-pass-swatch swatch-${key}`} aria-hidden="true" />
            {label.split(' · ')[0]}
            <b>{total(key) !== undefined ? number.format(total(key)!) : '—'}</b>
          </p>
        ))}
        {shown['rutas-bloques'] && (
          <small>
            {blocks.map((b) => (
              <span key={b.bloque} className="second-pass-block">
                <i style={{ background: BLOCK_COLORS[b.bloque as keyof typeof BLOCK_COLORS] }} />
                {b.capa} ({b.bloque}): {b.coincidencias_5cm} coincidencias a 5 cm
              </span>
            ))}
            Línea intensa: sin equivalente en el modelo. ▲ sentido del bloque (calibrado con las
            flechas del modelo). No se fusionan con las rutas municipales.
          </small>
        )}
        {shown['puntos-topograficos'] && (
          <small>
            <i className="second-pass-dot usable" /> Cota utilizable (coincide con su rótulo Z){' '}
            <i className="second-pass-dot" /> Z no utilizable. Sin datum vertical declarado.
          </small>
        )}
        {shown.toponimia && (
          <small>
            {Object.entries(TOPONYM_COLORS).map(([clase, color]) => (
              <span key={clase} style={{ color }} className="second-pass-class">
                {clase}
              </span>
            ))}
          </small>
        )}
        {shown['etiquetas-lote'] && (
          <small>
            {zoom < LOT_LABEL_MIN_ZOOM
              ? `Acerque el mapa (zoom ${LOT_LABEL_MIN_ZOOM}+) para cargar los rótulos de lote.`
              : truncated
                ? 'Ventana con demasiados rótulos: se muestra una parte. Acerque más.'
                : 'Rótulos de la ventana visible. Sin nombres de titulares.'}
          </small>
        )}
        {tomaque && (
          <small>
            Tomaque: traslación medida +{tomaque.translation_m.dE} m E, +{tomaque.translation_m.dN}{' '}
            m N ({number.format(tomaque.vertices_within_5cm)} vértices, RMS{' '}
            {(tomaque.rms_within_5cm_m * 100).toFixed(1)} cm); PSAD56 implicaría{' '}
            {tomaque.psad56_expected_shift_m.dE} m E, {tomaque.psad56_expected_shift_m.dN} m N.
            Traslación adoptada como CRS de Tomaque (16/10/2026).
          </small>
        )}
      </div>
    </details>
  );
}
