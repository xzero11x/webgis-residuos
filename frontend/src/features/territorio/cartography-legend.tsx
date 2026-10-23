import type { FeatureCollection } from 'geojson';
import type { Visibility } from './types';

export function CartographyLegend({
  data,
  visibility,
  routeCode,
  technical,
  visibleCodes,
}: {
  data?: FeatureCollection;
  visibility: Visibility;
  routeCode?: string;
  technical: boolean;
  visibleCodes: string[];
}) {
  const features = (data?.features || []).filter((f) => {
    const p = f.properties;
    if (!p) return false;
    if (['zona', 'horario'].includes(p.kind)) return technical;
    return routeCode
      ? p.routeCode === routeCode
      : !p.routeCode || visibleCodes.includes(p.routeCode);
  });
  const count = (kind: string) => features.filter((f) => f.properties?.kind === kind).length;
  return (
    <details
      className="cartography-legend"
      open={technical || window.innerWidth >= 768 || undefined}
    >
      <summary>
        Leyenda del mapa{' '}
        <span>{routeCode ? routeCode.replace('MUN-', '') : 'Todas las rutas'}</span>
      </summary>
      <div className="legend-items">
        {visibility.simbolos && (
          <>
            <p>
              <i className="symbol-start">I</i> Inicio <b>{count('inicio')}</b>
            </p>
            <p>
              <i className="symbol-end">F</i> Fin <b>{count('fin')}</b>
            </p>
            <p>
              <i className="symbol-stop" /> Parada del plano <b>{count('parada')}</b>
            </p>
          </>
        )}
        {visibility.sentidos && (
          <p>
            <i>▲</i> Sentido del plano <b>{count('sentido')}</b>
          </p>
        )}
        {technical && visibility.zonas && (
          <p>
            <i>▱</i> Rellenos por revisar <b>{count('zona')}</b>
          </p>
        )}
        {technical && visibility.horarios && (
          <p>
            <i>◷</i> Tiempos sin validar <b>{count('horario')}</b>
          </p>
        )}
        <small>
          Las flechas aparecen al acercar el mapa. Símbolos recuperados del plano; vigencia del
          servicio por confirmar.
        </small>
        {routeCode && (
          <small>
            Solo símbolos con asociación espacial inequívoca. Los demás se consultan en la vista
            general.
          </small>
        )}
        {technical && (
          <small>
            Sin límites de cobertura confirmados. Las zonas discontinuas son rellenos CAD
            candidatos; no áreas aprobadas.
          </small>
        )}
      </div>
    </details>
  );
}
