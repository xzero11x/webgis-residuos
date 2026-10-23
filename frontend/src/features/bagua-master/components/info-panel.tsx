import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { OVERTURE_VERSION } from '../config';
import { useBaguaMasterElement } from '../hooks/use-bagua-master';
import type { BaguaMasterElement, Selection } from '../types';

const TABLE_NAMES: Record<string, string> = {
  red_vial: 'Vía',
  conector: 'Conector vial',
  edificio: 'Edificación',
  parte_edificio: 'Parte de edificación',
  uso_suelo: 'Uso del suelo',
  agua: 'Agua',
  terreno: 'Terreno',
  lugar: 'Lugar',
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

export function InfoPanel({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const query = useBaguaMasterElement(selection);
  const element = query.data;
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
          {query.isError && <p role="alert">No se pudo cargar el elemento.</p>}
          {element && (
            <dl>
              <Row label="Identificador Overture" mono>
                {element.id}
              </Row>
              {unnamedRoad && (
                <Row label="Nombre en Overture">No publicado por Overture 2026-09-23.1</Row>
              )}
              {unnamedRoad && recovered && (
                <>
                  <Row label="Nombre recuperado">{recovered.nombre}</Row>
                  <Row label="Origen del nombre">
                    Documental: DWG «RUTA TOMAQUE - BRUJO PATA - CASUARINAS» (texto «
                    {recovered.nombreDocumental}»), asociado por{' '}
                    {recovered.nivel === 'texto' ? 'posición y orientación' : 'continuidad vial'}
                    {recovered.respaldoRpu === 'respaldado' ? ' y lotes colindantes' : ''}.
                  </Row>
                  <Row label="Aviso">{recovered.aviso}</Row>
                </>
              )}
              <Row label="Tipo">{tipo || 'Sin clase publicada por Overture'}</Row>
              {element.alturaM !== null && <Row label="Altura (Overture)">{element.alturaM} m</Row>}
              {element.numPisos !== null && (
                <Row label="Plantas (Overture)">{element.numPisos}</Row>
              )}
              {element.tabla === 'edificio' &&
                element.alturaM === null &&
                element.numPisos === null && <Row label="Altura">No publicada por Overture</Row>}
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
              <Row label="Fuente">
                {fuentes.length ? fuentes.join('; ') : 'Sin fuente declarada'}
              </Row>
              <Row label="Conjunto de datos">Overture Maps {OVERTURE_VERSION}</Row>
            </dl>
          )}
        </div>
      )}
    </aside>
  );
}
