import { useState } from 'react';
import { FileText, Ruler, X } from 'lucide-react';
import type { MapSelection } from './types';

const LAYER_NAMES: Record<string, string> = {
  'rutas-bloques': 'Trazo de bloque no insertado',
  'puntos-topograficos': 'Punto topográfico',
  manzanas: 'Contorno de manzana',
  toponimia: 'Topónimo CAD',
  'hojas-planos': 'Ventana de hoja',
  cotas: 'Cota del dibujo',
  'etiquetas-lote': 'Rótulo de lote',
};

function list(value?: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function title(p: Record<string, string>) {
  switch (p.kind) {
    case 'rutas-bloques':
      return p.tipo === 'simbolo' ? `Símbolo ${p.simbolo} · ${p.capa}` : `Trazo · ${p.capa}`;
    case 'puntos-topograficos':
      return `Punto ${p.punto || 's/n'} · ${p.descripcion || 'sin descripción'}`;
    case 'manzanas': {
      const labels = list(p.rotulos_manzana);
      return labels.length ? `Manzana ${labels.join(', ')}` : 'Contorno de manzana';
    }
    case 'hojas-planos':
      return `Hoja ${p.hoja} · ventana ${p.ventana}`;
    case 'cotas':
      return `${p.valor} ${p.unidad === 'grados' ? '°' : 'm'}`;
    default:
      return p.texto || LAYER_NAMES[p.kind ?? ''] || 'Elemento CAD';
  }
}

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="second-pass-fact">
      <span>{label}</span>
      {value}
    </p>
  );
}

function crsStatus(p: Record<string, string>) {
  if (p.crsStatus === 'declarado') return 'CRS declarado en el DWG (GEODATA EPSG:32717).';
  if (p.kind === 'rutas-bloques')
    return 'Posición provisional: traslación medida para este bloque no insertado. No forma parte de las rutas municipales.';
  if (p.crsStatus === 'adoptado')
    return 'CRS adoptado para Tomaque el 16/10/2026: EPSG:32717 tras la traslación medida contra RUTAS CON TIEMPO.dwg.';
  return 'Posición provisional: traslación medida, pendiente de decisión.';
}

export function SecondPassDetail({
  feature,
  onClose,
}: {
  feature: MapSelection;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const p = feature.properties;
  const review = p.status === 'por revisar';
  const usable = p.cota_utilizable === 'true';
  return (
    <aside
      className={`detail-panel municipal-detail second-pass-detail ${expanded ? 'expanded' : ''}`}
      aria-label="Ficha de capa"
    >
      <button
        className="detail-mobile-handle"
        type="button"
        aria-label={expanded ? 'Contraer ficha de capa' : 'Expandir ficha de capa'}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span />
      </button>
      <div className="panel-heading">
        <div>
          <span className={review ? 'demo-tag' : 'municipal-tag'}>
            {review ? 'POR REVISAR' : 'DOCUMENTAL CAD'}
          </span>
          <h2>{title(p)}</h2>
          <small>{LAYER_NAMES[p.kind ?? '']} · segunda pasada DWG</small>
        </div>
        <button type="button" aria-label="Cerrar información de capa" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="panel-scroll">
        {review && p.reviewNote && <p className="source-notice pending">{p.reviewNote}</p>}
        {p.nota && <p className="source-notice">{p.nota}</p>}
        <section className="detail-section">
          <h3>
            <Ruler size={14} /> Datos del dibujo
          </h3>
          {p.kind === 'rutas-bloques' && (
            <>
              <Fact label="Bloque" value={p.bloque_origen} />
              <Fact label="Comparación con el modelo" value={p.comparacion_modelo} />
              <Fact label="Entidad CAD" value={p.cad_tipo && `${p.cad_tipo} · color ${p.color}`} />
              <Fact
                label="Sentido"
                value={
                  p.rumbo_grados &&
                  `Rumbo ${Math.round(Number(p.rumbo_grados))}° (giro CAD ${Math.round(Number(p.rotacion_cad_grados))}°)`
                }
              />
            </>
          )}
          {p.kind === 'puntos-topograficos' && (
            <>
              <Fact
                label="Cota"
                value={usable ? `${p.z} m · utilizable` : 'No utilizable como cota'}
              />
              <Fact label="Estado de la cota" value={p.cota_estado} />
              <Fact label="Rótulo Z" value={p.z_rotulo} />
              <Fact label="Origen" value={p.bloque ? `${p.origen} · ${p.bloque}` : p.origen} />
            </>
          )}
          {p.kind === 'manzanas' && (
            <>
              <Fact
                label="Calles RPU_GRAFICOS"
                value={list(p.calles_colindantes).join(' · ') || 'Sin xdata de calles'}
              />
              <Fact label="Handle CAD" value={p.handle} />
              {p.curvas_aproximadas === 'true' && (
                <Fact label="Geometría" value="Arcos aproximados por sus vértices" />
              )}
            </>
          )}
          {p.kind === 'toponimia' && (
            <>
              <Fact label="Clase" value={p.clase} />
              {p.ya_en_cartografia === 'true' && (
                <Fact label="Cartografía" value="Ya publicado en la capa CALLES" />
              )}
            </>
          )}
          {p.kind === 'hojas-planos' && (
            <>
              <Fact label="Escala de la ventana" value={p.escala_aprox} />
              <Fact label="Giro" value={`${p.giro_grados}°`} />
              <Fact label="Rótulos técnicos" value={list(p.rotulos_tecnicos).join(' · ')} />
            </>
          )}
          {p.kind === 'cotas' && (
            <>
              <Fact label="Unidad" value={p.unidad} />
              <Fact label="Texto sustituido" value={p.texto_sustituido} />
            </>
          )}
          {p.kind === 'etiquetas-lote' && (
            <>
              <Fact label="Tipo" value={p.tipo} />
              <Fact
                label="Código EGPT_EPOD"
                value={p.codigo_epod && `${p.codigo_epod} (significado desconocido)`}
              />
            </>
          )}
          {p.isValid === 'false' && (
            <p className="source-notice pending">
              Geometría no válida sin reparar: {p.validityReason}
            </p>
          )}
        </section>
        <section className="detail-section">
          <h3>
            <FileText size={14} /> Procedencia
          </h3>
          <p className="source-filename">{p.source}</p>
          {p.capa && <small>Capa CAD: {p.capa}</small>}
          <p className="second-pass-crs">
            <span>crs</span>
            {p.crs}
          </p>
          <p className={p.crsStatus === 'provisional' ? 'source-notice pending' : ''}>
            {crsStatus(p)}
          </p>
        </section>
        <details className="source-details">
          <summary>Coordenadas y referencia</summary>
          <p>UTM 17S (centroide): {list(p.utm).join(' E, ')} N</p>
          <p>
            Traslación aplicada: {p.offsetE} m E, {p.offsetN} m N. Coordenadas del dibujo = UTM −
            traslación.
          </p>
          <p className="cad-handles">{p.id}</p>
        </details>
      </div>
    </aside>
  );
}
