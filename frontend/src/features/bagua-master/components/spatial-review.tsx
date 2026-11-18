import { useWorkspaceEdits } from '@/features/gestion/workspace-edits-context';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { Geometry, FeatureCollection } from 'geojson';
import { Button } from '@/components/ui/button';
import { management, type User } from '@/features/gestion/api';

type Building = { id: string; nombre: string | null; geometria: Geometry };
type Candidate = {
  id: string;
  edificio_id: string;
  estado: string;
  version: number;
  evidencia: string;
  criterio: string;
  version_overture: string;
  otros_confirmados: number;
  geometria: Geometry;
  motivo: string | null;
  revisor: string | null;
  creado_en: string;
  revisado_en: string | null;
};
export function SpatialReview({
  id,
  map,
  selected,
  onSelect,
  onClose,
}: {
  id: string;
  map: MapLibreMap | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const edits = useWorkspaceEdits();
  const [suggestions, setSuggestions] = useState<Building[]>([]),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['gestion', 'espacial', id],
    queryFn: () =>
      management<{
        predio: { codigo: string; direccion: string; version: number; archivado: boolean };
        items: Candidate[];
        fuente: string;
      }>(`/predios/${id}/espacial`),
    retry: false,
    gcTime: 0,
  });
  const session = useQuery({
    queryKey: ['gestion', 'sesion'],
    queryFn: () => management<User>('/sesion'),
    retry: false,
  });
  const building = useQuery({
    queryKey: ['gestion', 'edificio-candidato', selected],
    queryFn: () => management<Building>(`/espacial/edificios/${encodeURIComponent(selected!)}`),
    enabled: !!selected,
    retry: false,
  });
  const sourceId = 'bm-revision-espacial';
  useEffect(() => {
    if (!map) return;
    let disposed = false;
    const render = () => {
      if (disposed || !map.isStyleLoaded()) return;
      const features: FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          ...(query.data?.items ?? [])
            .filter((c) => c.estado !== 'desvinculado' && c.estado !== 'rechazado')
            .map((c) => ({
              type: 'Feature' as const,
              geometry: c.geometria,
              properties: { estado: c.estado, id: c.edificio_id },
            })),
          ...(building.data
            ? [
                {
                  type: 'Feature' as const,
                  geometry: building.data.geometria,
                  properties: { estado: 'seleccionado', id: building.data.id },
                },
              ]
            : []),
        ],
      };
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data: features });
        map.addLayer({
          id: sourceId + '-fill',
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': ['case', ['==', ['get', 'estado'], 'confirmado'], '#20634f', '#92621d'],
            'fill-opacity': 0.22,
          },
        });
        map.addLayer({
          id: sourceId + '-line',
          type: 'line',
          source: sourceId,
          paint: { 'line-color': '#20634f', 'line-width': 3 },
        });
      } else (map.getSource(sourceId) as GeoJSONSource).setData(features);
    };
    render();
    map.once('idle', render);
    return () => {
      disposed = true;
      map.off('idle', render);
      if (map.getLayer(sourceId + '-line')) map.removeLayer(sourceId + '-line');
      if (map.getLayer(sourceId + '-fill')) map.removeLayer(sourceId + '-fill');
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, query.data, building.data]);
  async function mutate(path: string, method: string, data: unknown) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await management(path, method, data);
      edits.saved();
      await client.invalidateQueries({ queryKey: ['gestion'] });
      setMessage('Revisión guardada con historial.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      return false;
    } finally {
      setPending(false);
    }
  }
  function frame(geometry: Geometry) {
    const coords: number[][] = [];
    function collect(value: unknown) {
      if (Array.isArray(value)) {
        if (typeof value[0] === 'number') coords.push(value as number[]);
        else value.forEach(collect);
      }
    }
    if ('coordinates' in geometry) collect(geometry.coordinates);
    if (!coords.length || !map) return;
    map.fitBounds(
      [
        [Math.min(...coords.map((c) => c[0]!)), Math.min(...coords.map((c) => c[1]!))],
        [Math.max(...coords.map((c) => c[0]!)), Math.max(...coords.map((c) => c[1]!))],
      ],
      {
        padding:
          window.innerWidth < 768
            ? {
                top: 40,
                left: 25,
                right: 65,
                bottom: Math.round(map.getContainer().clientHeight * 0.55),
              }
            : 60,
        maxZoom: 18,
        duration: 400,
      },
    );
  }
  const editable =
    session.isSuccess && session.data.rol !== 'consulta' && !query.data?.predio.archivado;
  return (
    <aside
      className={`bm-predio-inspector bm-spatial-review${expanded ? ' is-expanded' : ''}`}
      onChangeCapture={(event) => {
        if ((event.target as HTMLElement).closest('form')) edits.dirty();
      }}
      aria-label="Revisión espacial del predio"
    >
      <header>
        <h2>Revisión espacial</h2>
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Reducir revisión' : 'Ampliar revisión'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Volver a ficha
        </Button>
      </header>
      <div className="bm-inspector-content">
        {query.isPending ? (
          <p role="status">Cargando revisión…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>No se pudo consultar la revisión.</p>
            <Button onClick={() => void query.refetch()}>Reintentar revisión</Button>
          </div>
        ) : (
          <>
            <h3>{query.data.predio.codigo}</h3>
            <p>{query.data.predio.direccion}</p>
            <p>
              Datos de prueba — no oficiales. Selecciona un edificio en el mapa; no se deduce
              identidad predial.
            </p>
            <p>
              {query.data.fuente}. Confirmar el vínculo no crea coordenadas administrativas ni
              certifica límites.
            </p>
            {query.data.predio.archivado && <p>Predio archivado: solo consulta.</p>}
            <Button
              variant="outline"
              disabled={pending || !map}
              onClick={async () => {
                if (!map) return;
                setError('');
                setPending(true);
                try {
                  const b = map.getBounds();
                  const found = await management<{ items: Building[]; hayMas: boolean }>(
                    `/espacial/candidatos?${new URLSearchParams({ oeste: String(b.getWest()), sur: String(b.getSouth()), este: String(b.getEast()), norte: String(b.getNorth()) })}`,
                  );
                  setSuggestions(found.items);
                  setMessage(
                    found.hayMas
                      ? 'Más de 30 candidatos. Acerca el mapa para reducir ambigüedad.'
                      : `${found.items.length} candidatos por intersección con la vista. Ninguno confirmado automáticamente.`,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo buscar.');
                } finally {
                  setPending(false);
                }
              }}
            >
              Examinar edificios en esta vista
            </Button>
            <ul className="bm-inspector-list">
              {suggestions.map((item) => (
                <li key={item.id}>
                  <Button
                    variant="outline"
                    onClick={() => {
                      onSelect(item.id);
                      frame(item.geometria);
                    }}
                  >
                    Examinar {item.nombre || item.id}
                  </Button>
                </li>
              ))}
            </ul>
            {selected && building.isPending && <p role="status">Consultando geometría…</p>}
            {building.isError && <p role="alert">El edificio seleccionado no está disponible.</p>}
            {building.data && (
              <section>
                <h3>Edificio seleccionado</h3>
                <p className="bm-mono">{building.data.id}</p>
                <p>
                  {building.data.nombre ||
                    'Sin nombre/dirección publicada en este registro cartográfico.'}
                </p>
                <Button variant="outline" onClick={() => frame(building.data.geometria)}>
                  Encuadrar geometría seleccionada
                </Button>
                {editable && (
                  <form
                    className="gm-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const ok = await mutate(`/predios/${id}/espacial`, 'POST', {
                        edificioId: building.data.id,
                        criterio: suggestions.some((item) => item.id === building.data.id)
                          ? 'interseccion_vista'
                          : 'seleccion_mapa',
                        evidencia: new FormData(form).get('evidencia'),
                        versionPredio: query.data!.predio.version,
                      });
                      if (ok) form.reset();
                    }}
                  >
                    <label>
                      Evidencia de la propuesta
                      <textarea name="evidencia" required minLength={5} maxLength={1000} />
                    </label>
                    <Button type="submit" disabled={pending}>
                      Proponer vínculo para revisión
                    </Button>
                  </form>
                )}
              </section>
            )}
            <h3>Vínculos y candidatos registrados</h3>
            {!query.data.items.length && (
              <p>
                Sin candidatos registrados. El predio conserva su ficha aunque no tenga ubicación.
              </p>
            )}
            <ul className="bm-inspector-list">
              {query.data.items.map((c) => (
                <li key={c.id}>
                  <strong>{c.estado}</strong>
                  <p className="bm-mono">{c.edificio_id}</p>
                  <p>
                    Overture {c.version_overture} · {c.criterio}
                  </p>
                  <p>{c.evidencia}</p>
                  <p>
                    Propuesto:{' '}
                    {new Intl.DateTimeFormat('es-PE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(c.creado_en))}
                  </p>
                  {c.motivo && (
                    <p>
                      Decisión: {c.motivo} · {c.revisor}
                    </p>
                  )}
                  {c.revisado_en && (
                    <p>
                      Revisión:{' '}
                      {new Intl.DateTimeFormat('es-PE', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(c.revisado_en))}
                    </p>
                  )}
                  {c.otros_confirmados > 0 && (
                    <p>
                      Conflicto posible: {c.otros_confirmados} vínculos confirmados con otros
                      predios. Requiere justificación explícita.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      onSelect(c.edificio_id);
                      frame(c.geometria);
                    }}
                  >
                    Ver geometría {c.estado}
                  </Button>
                  {editable && session.data?.rol === 'administrador' && (
                    <form
                      className="gm-form"
                      key={`${c.id}-${c.version}`}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await mutate(`/predios/${id}/espacial/${c.id}`, 'PATCH', {
                          estado: f.get('estado'),
                          motivo: f.get('motivo'),
                          compartido: f.get('compartido') === 'on',
                          version: c.version,
                          versionPredio: query.data!.predio.version,
                        });
                      }}
                    >
                      <label>
                        Decisión para {c.edificio_id}
                        <select
                          name="estado"
                          aria-label={`Decisión ${c.edificio_id}`}
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Selecciona decisión
                          </option>
                          {(c.estado === 'confirmado'
                            ? ['revision', 'desvinculado']
                            : c.estado === 'rechazado' || c.estado === 'desvinculado'
                              ? ['revision']
                              : ['confirmado', 'rechazado', 'revision', 'desvinculado']
                          ).map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Motivo de revisión
                        <textarea name="motivo" required minLength={5} maxLength={1000} />
                      </label>
                      {c.otros_confirmados > 0 && (
                        <label>
                          <input type="checkbox" name="compartido" />
                          He revisado y justifico la relación compartida en el motivo
                        </label>
                      )}
                      <Button type="submit" disabled={pending}>
                        Guardar decisión espacial
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </div>
    </aside>
  );
}
