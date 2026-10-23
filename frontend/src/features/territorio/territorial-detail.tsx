import { useState, type ReactNode } from 'react';
import { AlertTriangle, FileText, GitBranch, Layers, Ruler, X } from 'lucide-react';
import { useTerritorioEntity } from './api';
import type { TerritorioEntity } from './types';

const KIND_NAMES: Record<string, string> = {
  manzana: 'Manzana',
  lote: 'Lote',
  vivienda: 'Vivienda',
  calle: 'Calle',
  sector: 'Sector',
  ruta: 'Ruta documental',
  ruta_candidata: 'Trazo candidato de bloque',
  punto_topografico: 'Punto topográfico',
  sombreado: 'Sombreado',
  hoja: 'Ventana de hoja',
  cota: 'Cota',
  institucion: 'Institución',
  hidrografia: 'Curso de agua',
  plano_ubicacion: 'Copia del plano de ubicación',
};

const RELATION_NAMES: Record<string, string> = {
  forma_coincidente_otra_clase: 'Misma forma, otra clase (no es identidad)',
  contenido_en: 'Contenido en',
  comparte_tramo: 'Comparte tramo (rutas independientes)',
};

const PROPERTY_NAMES: Record<string, string> = {
  marco_coordenadas: 'Marco de coordenadas',
  texto_en_la_misma_posicion: 'Texto distinto en la misma posición',
};

const ATTRIBUTE_NAMES: Record<string, string> = {
  rotulo: 'Rótulo',
  numero: 'Número de lote',
  medida: 'Medida',
  uso: 'Uso',
  letra: 'Letra',
  calle_rotulo: 'Calle (rótulo del plano)',
  rotulo_otro: 'Otro rótulo',
  calles_colindantes: 'Calles colindantes',
  calles_por_lado: 'Calles por lado (RPU)',
  situacion: 'Situación',
  capas_de_origen: 'Capas de origen',
  fuentes: 'Archivos',
  copias_en_fuentes: 'Copias en las fuentes',
  variantes_de_nombre: 'Variantes del nombre',
  cuadras: 'Cuadras',
  rotulos: 'Rótulos',
  cota_m: 'Cota verificada',
  z_no_verificado: 'Cota no verificada (no usar)',
  cota_utilizable: 'Cota utilizable',
  punto: 'Punto',
  descripcion: 'Descripción',
  bloque_no_insertado: 'Bloque no insertado',
  nota_de_uso: 'Uso',
  nombre_en_fuentes: 'Capas con este nombre',
  simbolos_sentido: 'Flechas de sentido',
  simbolos_inicio: 'Inicios',
  simbolos_fin: 'Finales',
  servicio_id: 'Servicio',
  estado_documental: 'Estado documental',
  codigo: 'Código',
  segmentos: 'Trazos',
  longitud_km: 'Longitud (km)',
  valido: 'Geometría válida',
  area_neta_m2: 'Área neta (m²)',
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== '').join(' · ') || '—';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return String(value);
  return String(value);
}

const GEOREF: Record<string, string> = {
  declarado_geodata: 'CRS declarado en el DWG (GEODATA EPSG:32717)',
  marco_adoptado: 'Marco adoptado: traslación medida aprobada el 16/10/2026',
  provisional: 'Provisional: pendiente de decisión',
};
const INTERPRETATION: Record<string, string> = {
  identidad_geometrica_comprobada: 'Identidad comprobada por geometría en el marco adoptado',
  contorno_documental_no_predio: 'Contorno documental: no es un predio ni acredita propiedad',
  edificacion_documental: 'Edificación documental: no es un predio',
  nombre_normalizado_sin_geometria_de_via: 'Nombre normalizado; la fuente no trae geometría de vía',
  nombre_de_capa_por_validar: 'Nombre tomado de la capa CAD; por validar',
  documental_no_operativa: 'Documental: no es una ruta operativa aprobada',
  levantamiento_documental: 'Punto de levantamiento; la cota solo se usa si está verificada',
  superficie_sin_significado_validado: 'Superficie sombreada; su significado no está validado',
  ventana_de_presentacion: 'Ventana de una hoja de presentación',
  medida_documental: 'Medida documental',
  toponimo_documental: 'Topónimo documental',
  candidato_bloque_no_insertado_sin_asignar:
    'Candidato de un bloque no insertado; no es una ruta municipal',
  copia_plano_precision_limitada:
    'Copia del plano de ubicación; precisión limitada (no es identidad)',
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <h3>
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function Attributes({ entity }: { entity: TerritorioEntity }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!entity.atributos.length)
    return <p className="territorial-empty">Sin atributos complementarios.</p>;
  return (
    <dl className="territorial-facts">
      {entity.atributos.map((a, i) => {
        const key = `${a.clave}-${i}`;
        return (
          <div key={key} className="territorial-fact">
            <dt>{ATTRIBUTE_NAMES[a.clave] ?? a.clave}</dt>
            <dd>
              {formatValue(a.valor)}
              <button
                type="button"
                className="territorial-source-toggle"
                aria-expanded={open === key}
                onClick={() => setOpen(open === key ? null : key)}
              >
                Procedencia
              </button>
              {open === key && (
                <small className="territorial-source">
                  {a.justificacion}
                  <br />
                  Fuente: {formatValue(a.fuente.tipo)}
                  {a.fuente.capa ? ` · capa ${formatValue(a.fuente.capa)}` : ''}
                  {a.fuente.handle ? ` · handle ${formatValue(a.fuente.handle)}` : ''}
                  {a.fuente.source ? ` · ${formatValue(a.fuente.source)}` : ''}
                  {a.tipo === 'principal' ? ' · valor principal' : ' · complementario'}
                </small>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function TerritorialDetail({
  id,
  technical,
  onClose,
}: {
  id: string;
  technical: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const query = useTerritorioEntity(id);
  const entity = query.data;
  return (
    <aside
      className={`detail-panel municipal-detail territorial-detail ${expanded ? 'expanded' : ''}`}
      aria-label="Ficha territorial"
    >
      <button
        className="detail-mobile-handle"
        type="button"
        aria-label={expanded ? 'Contraer ficha territorial' : 'Expandir ficha territorial'}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span />
      </button>
      <div className="panel-heading">
        <div>
          <span className={entity?.provisional ? 'demo-tag' : 'municipal-tag'}>
            {entity ? (entity.provisional ? 'PROVISIONAL' : 'TERRITORIO UNIFICADO') : 'CARGANDO'}
          </span>
          <h2>{entity?.nombre ?? 'Entidad territorial'}</h2>
          {entity && <small>{KIND_NAMES[entity.kind] ?? entity.kind}</small>}
        </div>
        <button type="button" aria-label="Cerrar ficha territorial" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="panel-scroll">
        {query.isPending && <p role="status">Cargando ficha…</p>}
        {query.isError && (
          <p className="source-notice pending" role="alert">
            No se pudo cargar la ficha.{' '}
            <button type="button" onClick={() => void query.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {entity && (
          <>
            <Section title="Identificación" icon={<FileText size={14} />}>
              <p>{INTERPRETATION[entity.estado.interpretacion] ?? entity.estado.interpretacion}</p>
              <p className="territorial-criterion">
                Criterio de identidad: {entity.criterio.replace(/_/g, ' ')}
                {entity.totales.representaciones > 1
                  ? ` · ${entity.totales.representaciones} representaciones en ${new Set(entity.representaciones.map((r) => r.fuente)).size} archivo(s)`
                  : ' · una sola representación'}
              </p>
              {entity.nombreNormalizado && (
                <small>Nombre normalizado: {entity.nombreNormalizado}</small>
              )}
            </Section>

            <Section title="Geometría de referencia" icon={<Ruler size={14} />}>
              <p>{GEOREF[entity.estado.georreferencia] ?? entity.estado.georreferencia}</p>
              <p className="source-notice pending">
                Pendiente de validación municipal. No es una operación ni un predio aprobado.
              </p>
            </Section>

            <Section title="Atributos consolidados" icon={<Layers size={14} />}>
              <Attributes entity={entity} />
            </Section>

            <Section title="Fuentes vinculadas" icon={<FileText size={14} />}>
              {entity.representaciones.length ? (
                <ul className="territorial-sources">
                  {entity.representaciones.map((r) => (
                    <li key={r.key}>
                      <strong>{r.fuente}</strong>
                      <span>
                        {' '}
                        · {r.capa ?? '—'}
                        {r.referencia ? ` · ${r.referencia}` : ''}
                      </span>
                      {technical && (
                        <small>
                          {' '}
                          · geometría {r.tipoGeometria} ·{' '}
                          {r.crs === 'adoptado' ? 'marco adoptado' : r.crs} · desviación{' '}
                          {r.desviacionM.toFixed(3)} m · traslación {r.traslacion[0]} /{' '}
                          {r.traslacion[1]} m
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="territorial-empty">Sin fuentes vinculadas.</p>
              )}
            </Section>

            <Section title="Relaciones con otras entidades" icon={<GitBranch size={14} />}>
              {entity.relaciones.length ? (
                <ul className="territorial-relations">
                  {entity.relaciones.map((r) => (
                    <li key={r.id}>
                      {RELATION_NAMES[r.tipo] ?? r.tipo}:{' '}
                      {r.entidad?.nombre ?? 'entidad no disponible'}
                      {r.entidad && (
                        <small> · {KIND_NAMES[r.entidad.kind] ?? r.entidad.kind}</small>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="territorial-empty">Sin relaciones registradas.</p>
              )}
            </Section>

            {(entity.conflictos.length > 0 || entity.excepciones.length > 0) && (
              <Section title="Conflictos y excepciones" icon={<AlertTriangle size={14} />}>
                {entity.conflictos.map((c) => (
                  <div key={c.id} className="source-notice pending">
                    <strong>{PROPERTY_NAMES[c.propiedad] ?? c.propiedad}</strong> ·{' '}
                    {c.estado.replace(/_/g, ' ')}
                    <ul>
                      {(c.valores as Record<string, unknown>[]).map((v, i) => (
                        <li key={i}>
                          {formatValue(v.texto ?? v.marco ?? v.valor)} ·{' '}
                          {formatValue(v.fuente ?? v.capa)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {entity.excepciones.map((x) => (
                  <p key={x.id} className="source-notice pending">
                    {x.nota}
                  </p>
                ))}
              </Section>
            )}

            <Section title="Reglas aplicadas" icon={<GitBranch size={14} />}>
              <ul className="territorial-rules">
                {entity.reglas.map((r) => (
                  <li key={`${r.id}-${r.version}`}>
                    <small>{r.descripcion}</small>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
