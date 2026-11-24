import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { management } from '@/features/gestion/api';
import { ChevronDown, X } from 'lucide-react';
import { OVERTURE_VERSION } from '../config';
import { useBaguaMasterElement, useServiceAt } from '../hooks/use-bagua-master';
import { ServiceSchedule } from './service-schedule';
import { representativePoint } from './service-format';
import { CorrectionActions } from './map-corrections';
import type { BaguaMasterElement, Selection } from '../types';

const TABLE_NAMES: Record<string, string> = {
  red_vial: 'Vía',
  conector: 'Conector vial',
  edificio: 'Edificación',
  edificio_complemento: 'Edificación complementaria',
  parte_edificio: 'Parte de edificación',
  uso_suelo: 'Uso del suelo',
  agua: 'Agua',
  terreno: 'Terreno',
  lugar: 'Lugar',
  infraestructura: 'Infraestructura del servicio',
};

const INFRA_LABEL: Record<string, string> = {
  contenedor: 'Contenedor',
  punto_limpio: 'Punto limpio',
  centro_acopio: 'Centro de acopio',
  planta_organicos: 'Planta de compostaje',
  disposicion_final: 'Disposición final',
};
// Elementos puntuales o lineales: para ellos tiene sentido decir qué servicio pasa y a qué hora.
const SCHEDULE_TABLES = new Set([
  'edificio',
  'edificio_complemento',
  'lugar',
  'red_vial',
  'conector',
  'infraestructura',
]);

const COMPLEMENT_SOURCES: Record<string, string> = {
  osm: 'OpenStreetMap',
  google_ob_raw: 'Google Open Buildings v3',
  ms_buildings: 'Microsoft Global ML Building Footprints',
  google_presencia: 'Presencia satelital · Google Open Buildings 2.5D Temporal 2023',
};
// Atributos de Overture que ya se muestran aparte o son estructuras internas.
const HIDDEN = new Set([
  'names',
  'sources',
  'bbox',
  'version',
  'class',
  'subtype',
  'subclass',
  'taxonomy',
  'categories',
  'height',
  'num_floors',
  'filename',
  'theme',
  'type',
  // Contactos de lugares: pueden ser datos personales; no se muestran.
  'phones',
  'emails',
  'socials',
]);

function readable(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((v) =>
        v && typeof v === 'object' && 'value' in v
          ? readable((v as { value: unknown }).value)
          : readable(v),
      )
      .filter((p): p is string => !!p);
    return parts.length ? [...new Set(parts)].join(', ') : null;
  }
  return null;
}

function extraAttributes(element: BaguaMasterElement) {
  return Object.entries(element.atributos)
    .filter(([key]) => !HIDDEN.has(key))
    .map(([key, value]) => [key, readable(value)] as const)
    .filter((entry): entry is readonly [string, string] => !!entry[1])
    .slice(0, 12);
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'bm-mono' : undefined}>{children}</dd>
    </div>
  );
}

export function InfoPanel({
  selection,
  onClose,
  canEdit = false,
  relocated = false,
  onMove,
}: {
  selection: Selection;
  onClose: () => void;
  /** Sesión con permiso de escritura: muestra las acciones de corrección del mapa. */
  canEdit?: boolean;
  /** El lugar tiene su ubicación corregida localmente. */
  relocated?: boolean;
  onMove?: (nombre: string) => void;
}) {
  const linked = useQuery({
    queryKey: ['gestion', 'edificio-predios', selection.id],
    queryFn: () =>
      management<{
        items: { id: string; codigo: string; direccion: string; archivado: boolean }[];
      }>(`/espacial/edificios/${encodeURIComponent(selection.id)}/predios`),
    enabled: selection.tabla === 'edificio',
    retry: false,
    gcTime: 0,
  });
  const [collapsed, setCollapsed] = useState(false);
  const query = useBaguaMasterElement(selection);
  const element = query.data;
  const schedulePoint =
    element && SCHEDULE_TABLES.has(selection.tabla) ? representativePoint(element.geometria) : null;
  const schedule = useServiceAt(schedulePoint);
  const kind = TABLE_NAMES[selection.tabla];
  // Una vía sin `names.primary` en Overture se dice tal cual: el dato falta en la fuente.
  const unnamedRoad = element?.tabla === 'red_vial' && !element.nombre;
  const recovered = element?.nombreComplementario ?? null;
  const title = element
    ? element.nombre ||
      recovered?.nombre ||
      (unnamedRoad
        ? 'Vía sin nombre en Overture'
        : element.tipo?.replace(/_/g, ' ') || 'Sin nombre en Overture')
    : 'Cargando…';
  const tipo = element
    ? [element.tipo, element.subtipo, element.subclase, element.categoria]
        .filter(Boolean)
        .map((v) => v!.replace(/_/g, ' '))
        .join(' · ')
    : '';
  const fuentes = element
    ? [
        ...new Set(
          element.fuentes
            .map((f) => [f.dataset, f.license].filter(Boolean).join(' · '))
            .filter(Boolean),
        ),
      ]
    : [];
  return (
    <aside
      className={`bm-info ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Información del elemento"
      data-testid="bm-info"
    >
      <header className="bm-info-head">
        <button
          type="button"
          className="bm-info-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Mostrar información' : 'Plegar información'}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronDown size={16} />
        </button>
        <div className="bm-info-heading">
          <p className="bm-info-kind">{kind}</p>
          <h2 className="bm-info-title">{title}</h2>
        </div>
        <button
          type="button"
          className="bm-info-close"
          aria-label="Cerrar información"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {!collapsed && (
        <div className="bm-info-body">
          {selection.tabla === 'edificio' && (
            <p className="bm-rutas-ayuda">
              Edificación cartográfica de Overture; su geometría no identifica un predio
              administrativo.
            </p>
          )}
          {query.isError && <p role="alert">No se pudo cargar el elemento.</p>}
          {element && (
            <>
              {selection.tabla === 'edificio' && (
                <section>
                  <h3>Predios relacionados</h3>
                  {linked.isPending ? (
                    <p role="status">Consultando vínculos…</p>
                  ) : linked.isError ? (
                    <p>Se requiere sesión autorizada para consultar los vínculos.</p>
                  ) : linked.data.items.length ? (
                    <ul>
                      {linked.data.items.map((p) => (
                        <li key={p.id}>
                          <Link to={`/bagua-master?predio=${p.id}`}>
                            {p.codigo} · {p.direccion}
                            {p.archivado ? ' · Archivado' : ''}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Edificación de Overture sin relación predial confirmada. No se asume ningún
                      predio por cercanía.
                    </p>
                  )}
                </section>
              )}
              {schedulePoint && (
                <section className="bm-recoleccion" aria-labelledby="h-recoleccion">
                  <h3 id="h-recoleccion">Recolección aquí</h3>
                  <ServiceSchedule
                    services={schedule.data?.servicios}
                    loading={schedule.isPending}
                  />
                </section>
              )}
              {element.infraestructura && (
                <dl>
                  <Row label="Tipo">{INFRA_LABEL[element.tipo ?? ''] ?? element.tipo}</Row>
                  <Row label="Descripción">{element.infraestructura.descripcion}</Row>
                  {element.infraestructura.horario && (
                    <Row label="Horario">{element.infraestructura.horario}</Row>
                  )}
                  {element.infraestructura.materiales.length > 0 && (
                    <Row label="Recibe">{element.infraestructura.materiales.join(', ')}</Row>
                  )}
                  <Row label="Identificador" mono>
                    {element.id}
                  </Row>
                </dl>
              )}
              {!element.infraestructura && (
                <dl>
                  <Row
                    label={element.complemento ? 'Identificador' : 'Identificador Overture'}
                    mono
                  >
                    {element.id}
                  </Row>
                  {element.complemento && (
                    <>
                      <Row label="Origen de la huella">
                        {COMPLEMENT_SOURCES[element.complemento.fuente] ??
                          element.complemento.fuente}
                      </Row>
                      {element.complemento.registroFuente && (
                        <Row label="Registro de origen" mono>
                          {element.complemento.registroFuente}
                        </Row>
                      )}
                      <Row label="Altura">
                        {element.complemento.origenAltura === 'estimada_default'
                          ? `${element.complemento.alturaM.toLocaleString('es-PE')} m (valor de referencia)`
                          : `${element.complemento.alturaM.toLocaleString('es-PE')} m estimados · Google 2.5D Temporal 2023${
                              element.complemento.alturaCobertura !== null
                                ? ` · ${Math.round(element.complemento.alturaCobertura * 100)} % de la huella muestreada`
                                : ''
                            }`}
                      </Row>
                      <Row label="Forma">
                        {element.complemento.regularizacion === 'rectangulo'
                          ? 'Enderezada a rectángulo (la huella original era casi rectangular).'
                          : element.complemento.regularizacion === 'simplificada'
                            ? 'Simplificada a 0,25 m o 1 m según la fuente.'
                            : 'Sin modificar respecto a la fuente.'}
                      </Row>
                      <Row label="Licencia de los datos">{element.complemento.licencia}</Row>
                    </>
                  )}
                  {unnamedRoad && (
                    <Row label="Nombre en Overture">No publicado por Overture 2026-09-23.1</Row>
                  )}
                  {unnamedRoad && recovered && (
                    <>
                      <Row label="Nombre recuperado">{recovered.nombre}</Row>
                      <Row label="Origen del nombre">
                        Documental: DWG «RUTA TOMAQUE - BRUJO PATA - CASUARINAS» (texto «
                        {recovered.nombreDocumental}»), asociado por{' '}
                        {recovered.nivel === 'texto'
                          ? 'posición y orientación'
                          : 'continuidad vial'}
                        {recovered.respaldoRpu === 'respaldado' ? ' y lotes colindantes' : ''}.
                      </Row>
                      <Row label="Aviso">{recovered.aviso}</Row>
                    </>
                  )}
                  <Row label="Tipo">{tipo || 'Sin clase publicada por Overture'}</Row>
                  {relocated && (
                    <Row label="Ubicación">Corregida localmente sobre el mapa de Bagua</Row>
                  )}
                  {element.alturaM !== null && (
                    <Row label="Altura (Overture)">{element.alturaM} m</Row>
                  )}
                  {element.numPisos !== null && (
                    <Row label="Plantas (Overture)">{element.numPisos}</Row>
                  )}
                  {element.tabla === 'edificio' &&
                    element.alturaM === null &&
                    element.numPisos === null &&
                    !element.alturaEstimada &&
                    !element.alturaSimulada && (
                      <Row label="Altura">Sin altura disponible; se mantiene en 2D</Row>
                    )}
                  {element.alturaSimulada && (
                    <>
                      <Row label="Altura SIMULADA">
                        {element.alturaSimulada.alturaM.toLocaleString('es-PE')} m · solo
                        visualización
                      </Row>
                      <Row label="Origen de la simulación">
                        Modelo aleatorio reproducible con huellas comparables, alturas satelitales
                        cercanas y contexto GHSL 2018.
                      </Row>
                      <Row label="Referencias cercanas">
                        {element.alturaSimulada.vecinos} edificios con altura satelital en un radio
                        de 350 m.
                      </Row>
                      <Row label="Aviso">
                        Sin altura satelital aceptada para esta huella. El volumen es sintético; no
                        indica altura real ni número de pisos.
                      </Row>
                    </>
                  )}
                  {element.alturaEstimada && (
                    <>
                      <Row label="Altura estimada">
                        {element.alturaEstimada.alturaM.toLocaleString('es-PE')} m sobre el terreno
                      </Row>
                      <Row label="Fuente de la altura">
                        {element.alturaEstimada.fuente} ·{' '}
                        {element.alturaEstimada.fechaPrecision === 'anio'
                          ? element.alturaEstimada.fecha.slice(0, 4) + ' (referencia anual)'
                          : element.alturaEstimada.fecha}
                      </Row>
                      <Row label="Licencia de la altura">{element.alturaEstimada.licencia}</Row>
                      <Row label="Cobertura de datos válidos">
                        {Math.round(element.alturaEstimada.cobertura * 100)} % de la huella
                        muestreada
                      </Row>
                      <Row label="Precisión">
                        Estimación satelital; puede haber desplazamientos. No es una medición
                        catastral ni indica número de pisos.
                      </Row>
                    </>
                  )}
                  {element.longitudM !== null && (
                    <Row label="Longitud (calculada)">
                      {element.longitudM.toLocaleString('es-PE')} m
                    </Row>
                  )}
                  {element.areaM2 !== null && (
                    <Row label="Superficie (calculada)">
                      {element.areaM2.toLocaleString('es-PE')} m²
                    </Row>
                  )}
                  {extraAttributes(element).map(([key, value]) => (
                    <Row key={key} label={key.replace(/_/g, ' ')}>
                      {value}
                    </Row>
                  ))}
                  {!element.complemento && (
                    <>
                      <Row label="Fuente">
                        {fuentes.length ? fuentes.join('; ') : 'Sin fuente declarada'}
                      </Row>
                      <Row label="Conjunto de datos">Overture Maps {OVERTURE_VERSION}</Row>
                    </>
                  )}
                  {element.complemento && (
                    <Row label="Conjunto de datos">
                      Fusión de fuentes abiertas · {element.complemento.versionFusion}
                    </Row>
                  )}
                </dl>
              )}
              {canEdit && (
                <CorrectionActions
                  selection={selection}
                  onMove={() => onMove?.(title)}
                  onHidden={onClose}
                />
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
