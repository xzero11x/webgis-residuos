import { ChevronRight, Route, Search } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import { selectionProperties, type MapSelection } from './types';

interface Props {
  routes?: FeatureCollection;
  query: string;
  showReview: boolean;
  loading: boolean;
  selectedId?: string;
  onSelect: (value: MapSelection) => void;
  onShowReview: () => void;
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function RouteBrowser({
  routes,
  query,
  showReview,
  loading,
  selectedId,
  onSelect,
  onShowReview,
}: Props) {
  const municipal = (routes?.features || []).filter((r) => !r.properties?.isDemo);
  const matches = municipal.filter((r) =>
    normalize(
      `${r.properties?.nombre} ${r.properties?.codigo} ${r.properties?.servicio} ${r.properties?.source}`,
    ).includes(normalize(query)),
  );
  const visible = matches.filter((r) => showReview || r.properties?.status !== 'revision');
  const pending = matches.length - visible.length;
  return (
    <div className="route-browser" aria-label="Rutas municipales">
      <div className="route-browser-heading">
        <strong>Rutas del archivo municipal</strong>
        <span>{visible.length}</span>
      </div>
      <p className="route-browser-caption">Trazados recuperados · operación por validar</p>
      <div className="route-results">
        {loading ? (
          <p className="empty-results">Cargando rutas…</p>
        ) : (
          visible.map((r) => {
            const p = selectionProperties(r.properties || {});
            return (
              <button
                type="button"
                key={p.id}
                className={`route-result ${selectedId === p.id ? 'active' : ''}`}
                aria-label={`Ver ${p.nombre}`}
                onClick={() => onSelect({ kind: 'ruta', properties: p })}
              >
                <span className="route-swatch" style={{ color: p.color }}>
                  <Route size={18} />
                </span>
                <span>
                  <strong>{p.nombre}</strong>
                  <small>
                    {p.status === 'revision' ? 'Pendiente de revisión' : 'Georreferenciada'} ·{' '}
                    {p.lengthKm} km de trazos
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            );
          })
        )}
        {!loading && !matches.length && (
          <div className="empty-results">
            <Search size={18} />
            <p>No hay rutas para esta búsqueda o filtro.</p>
          </div>
        )}
      </div>
      {pending > 0 && (
        <button type="button" className="show-review" onClick={onShowReview}>
          Mostrar {pending} trazados pendientes de revisión
        </button>
      )}
    </div>
  );
}
