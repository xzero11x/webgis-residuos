import { MAP_THEMES, THEME_NAMES } from './themes';
import { describe, expect, it, vi } from 'vitest';
import {
  createPropertyExpression,
  latest,
  validateStyleMin,
  type StylePropertySpecification,
} from '@maplibre/maplibre-gl-style-spec';

vi.mock('../config', () => ({
  ATTRIBUTION: 'Overture',
  GLYPHS_URL: () => 'https://example.test/{fontstack}/{range}.pbf',
  TILES_URL: () => 'pmtiles://https://example.test/bagua-master.pmtiles',
  MAX_ZOOM: 20,
}));

const { buildStyle } = await import('./style');

function widthOf(layerId: string) {
  const layer = buildStyle().layers.find((l) => l.id === layerId) as {
    paint: Record<string, unknown>;
  };
  const compiled = createPropertyExpression(
    layer.paint['line-width'],
    'line-width',
    latest.paint_line['line-width'] as StylePropertySpecification,
  );
  if (compiled.result !== 'success') throw new Error(JSON.stringify(compiled.value));
  return (zoom: number, clase: string) =>
    compiled.value.evaluate({ zoom }, { type: 'LineString', properties: { clase } } as never);
}

describe('Estilo de BAGUA MASTER: anchura de vías', () => {
  const width = widthOf('bm-vias');
  const zooms = [12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('es un estilo MapLibre válido', () => {
    expect(validateStyleMin(buildStyle())).toEqual([]);
  });

  it('crece en cada nivel hasta el zoom máximo, sin tope intermedio', () => {
    for (const clase of ['primary', 'secondary', 'residential', 'service']) {
      for (let i = 1; i < zooms.length; i++)
        expect(width(zooms[i]!, clase)).toBeGreaterThan(width(zooms[i - 1]!, clase));
    }
  });

  it('desde zoom 16 escala como el terreno (×2 por nivel), igual que los edificios', () => {
    for (const clase of ['primary', 'tertiary', 'residential', 'service']) {
      for (const z of [16, 17, 18, 19])
        expect(width(z + 1, clase) / width(z, clase)).toBeCloseTo(2, 5);
    }
  });

  it('respeta la jerarquía vial en todos los zooms', () => {
    for (const z of zooms) {
      expect(width(z, 'trunk')).toBe(width(z, 'primary'));
      expect(width(z, 'primary')).toBeGreaterThan(width(z, 'secondary'));
      expect(width(z, 'secondary')).toBe(width(z, 'tertiary'));
      expect(width(z, 'tertiary')).toBeGreaterThan(width(z, 'residential'));
      expect(width(z, 'residential')).toBeGreaterThan(width(z, 'service'));
    }
  });

  it('usa anchuras cartográficas plausibles a escala de calle', () => {
    // Píxeles por metro a zoom 20 en Bagua (5,64° S): 2^20 / 77 892.
    const pxPerMeter = 2 ** 20 / 77_892;
    // 6 m: el mismo corredor de calzada que usa el ajuste de coherencia (docs/coherencia-interna.md).
    expect(width(20, 'residential') / pxPerMeter).toBeCloseTo(6, 5);
    expect(width(20, 'primary') / pxPerMeter).toBeCloseTo(9, 5);
    expect(width(12, 'residential')).toBeLessThan(1);
    // Doble calzada: separación mínima entre ejes paralelos en Overture = 9,2 m; cada calzada
    // debe ser más estrecha para que el separador central siga visible.
    for (const clase of ['primary', 'secondary', 'tertiary'])
      expect(width(20, clase) / pxPerMeter).toBeLessThan(9.2);
  });

  it('el borde, los senderos y el resaltado acompañan la anchura de la vía', () => {
    const path = widthOf('bm-senderos');
    const selection = widthOf('bm-seleccion-via');
    expect(path(20, 'footway') / path(18, 'footway')).toBeCloseTo(4, 5);
    expect(path(20, 'footway')).toBeLessThan(width(20, 'service'));
    for (const z of zooms)
      expect(selection(z, 'residential')).toBeCloseTo(width(z, 'residential') + 4, 5);
  });
});

describe('Estilo de BAGUA MASTER: rótulos de calles', () => {
  const layers = buildStyle().layers as unknown as {
    id: string;
    'source-layer'?: string;
    filter?: unknown;
    layout?: Record<string, unknown>;
  }[];
  const byId = (id: string) => layers.find((l) => l.id === id)!;

  it('los nombres de calle salen de la capa auxiliar y solo de elementos tipo calle', () => {
    const calles = byId('bm-calles-texto');
    expect(calles['source-layer']).toBe('calles_rotulo');
    expect(calles.filter).toEqual(['==', ['get', 'tipo'], 'calle']);
    expect(calles.layout?.['text-field']).toEqual(['get', 'nombre']);
  });

  it('la designación de ruta es una capa aparte, en cursiva y de otro color', () => {
    const rutas = byId('bm-rutas-texto');
    expect(rutas['source-layer']).toBe('calles_rotulo');
    expect(rutas.filter).toEqual(['==', ['get', 'tipo'], 'ruta']);
    expect(rutas.layout?.['text-font']).toEqual(['Noto Sans Italic']);
    const paint = (id: string) => (byId(id) as unknown as { paint: Record<string, string> }).paint;
    expect(paint('bm-rutas-texto')['text-color']).not.toBe(paint('bm-calles-texto')['text-color']);
  });

  it('las vías mayores se colocan primero (menor clave = mayor prioridad)', () => {
    const key = byId('bm-calles-texto').layout?.['symbol-sort-key'];
    const compiled = createPropertyExpression(
      key,
      'symbol-sort-key',
      latest.layout_symbol['symbol-sort-key'] as unknown as StylePropertySpecification,
    );
    if (compiled.result !== 'success') throw new Error(JSON.stringify(compiled.value));
    const sort = (rango: number) =>
      compiled.value.evaluate({ zoom: 16 }, { type: 'LineString', properties: { rango } } as never);
    expect(sort(4)).toBeLessThan(sort(3));
    expect(sort(3)).toBeLessThan(sort(2));
    expect(sort(2)).toBeLessThan(sort(0));
  });

  it('las capas de vías siguen leyendo red_vial y no usan la capa auxiliar', () => {
    for (const id of ['bm-vias', 'bm-vias-borde', 'bm-senderos', 'bm-seleccion-via'])
      expect(byId(id)['source-layer']).toBe('red_vial');
  });
});

describe('Estética independiente de la base Overture', () => {
  it('mantiene Overture como única base vectorial y las alturas como capa auxiliar', () => {
    const style = buildStyle();
    expect(style.sources.overture).toMatchObject({
      type: 'vector',
      url: 'pmtiles://https://example.test/bagua-master.pmtiles',
    });
    expect(Object.values(style.sources).filter((source) => source.type !== 'geojson')).toHaveLength(
      1,
    );
    for (const layer of style.layers) {
      if ('source-layer' in layer) expect(layer.source).toBe('overture');
    }
    expect(JSON.stringify(style.sources)).not.toMatch(/openfreemap\.org/);
  });
});

describe('Selector de temas locales sobre Overture', () => {
  it.each(THEME_NAMES)(
    '%s es válido y conserva fuentes, geometrías y filtros de Positron',
    (theme) => {
      const base = buildStyle();
      const next = buildStyle(theme);
      expect(validateStyleMin(next)).toEqual([]);
      expect(next.sources).toEqual(base.sources);
      expect(next.glyphs).toEqual(base.glyphs);
      const structure = (style: typeof base) =>
        style.layers.map((layer) => ({
          id: layer.id,
          type: layer.type,
          source: 'source' in layer ? layer.source : null,
          sourceLayer: 'source-layer' in layer ? layer['source-layer'] : null,
          filter: 'filter' in layer ? layer.filter : null,
        }));
      expect(structure(next)).toEqual(structure(base));
    },
  );

  it('cada tema tiene una paleta distinguible', () => {
    const backgrounds = THEME_NAMES.map((theme) =>
      buildStyle(theme).layers.find((layer) => layer.type === 'background')!,
    );
    expect(new Set(backgrounds.map((layer) => JSON.stringify(layer.paint))).size).toBe(
      THEME_NAMES.length,
    );
  });
});

describe('Capa complementaria de edificaciones', () => {
  const style = buildStyle();
  const layer = (id: string) => style.layers.find((l) => l.id === id)!;

  it('usa una fuente GeoJSON propia y no toca la base vectorial de Overture', () => {
    expect(style.sources['bm-complemento']).toMatchObject({ type: 'geojson' });
    for (const id of [
      'bm-complemento',
      'bm-complemento-borde',
      'bm-complemento-3d',
      'bm-complemento-seleccion',
    ])
      expect(layer(id)).toMatchObject({ source: 'bm-complemento' });
  });

  it('se dibujan con la misma apariencia que las huellas de Overture', () => {
    expect(layer('bm-complemento-borde').paint).not.toHaveProperty('line-dasharray');
    expect(JSON.stringify(layer('bm-complemento').paint)).not.toContain('baja');
    expect(style.layers.some((l) => l.id === 'bm-complemento-borde-baja')).toBe(false);
  });

  it('las alturas provisionales se dibujan como no observadas en 2.5D', () => {
    expect(JSON.stringify(layer('bm-complemento-3d').paint)).toContain('estimada_default');
    expect(layer('bm-complemento-3d').layout).toMatchObject({ visibility: 'none' });
  });
});

describe('legibilidad cartográfica', () => {
  it.each(THEME_NAMES)(
    '%s: edificios por tamaño, calles con borde por jerarquía y lugares por tipo',
    (name) => {
      const style = buildStyle(name);
      const paint = (id: string) =>
        JSON.stringify((style.layers.find((l) => l.id === id) as { paint: unknown }).paint);
      // Casas pequeñas y galpones no comparten color, igual en Overture y en la capa complementaria.
      expect(paint('bm-edificios')).toContain('area_m2');
      expect(paint('bm-edificios')).toBe(paint('bm-complemento'));
      // Avenidas con borde propio, distinto del de las calles locales.
      expect(paint('bm-vias-borde')).toContain('primary');
      // Cada grupo de lugares tiene su color.
      for (const group of ['restaurant', 'hotel', 'school', 'hospital', 'historic_site'])
        expect(paint('bm-lugares')).toContain(group);
      expect(validateStyleMin(style)).toEqual([]);
    },
  );

  it('los colores de edificios y calles se distinguen del fondo en cada tema', () => {
    for (const name of THEME_NAMES) {
      const { palette } = MAP_THEMES[name];
      expect(palette.edificio).not.toBe(palette.fondo);
      expect(palette.local).not.toBe(palette.fondo);
      expect(palette.edificioBorde).not.toBe(palette.edificio);
    }
  });
});

describe('avenidas de doble calzada', () => {
  it('cada calzada deja visible la berma central según la separación real', () => {
    const layer = buildStyle().layers.find((l) => l.id === 'bm-vias') as {
      paint: Record<string, unknown>;
    };
    const compiled = createPropertyExpression(
      layer.paint['line-width'],
      'line-width',
      latest.paint_line['line-width'] as StylePropertySpecification,
    );
    if (compiled.result !== 'success') throw new Error(JSON.stringify(compiled.value));
    const pxPerMeter = (zoom: number) => 2 ** zoom / 77_892;
    const width = (zoom: number, properties: Record<string, unknown>) =>
      compiled.value.evaluate({ zoom }, { type: 'LineString', properties } as never) /
      pxPerMeter(zoom);
    const avenida = { clase: 'primary', doble_calzada: 1, separacion_m: 10.7 };
    // 10,7 m entre ejes: calzadas de 7,2 m y 3,5 m de berma, en cualquier zoom de calle.
    for (const zoom of [16, 18, 20]) expect(width(zoom, avenida)).toBeCloseTo(7.2, 5);
    // Muy juntas: nunca menos de 3 m; muy separadas: el ancho normal de su clase.
    expect(width(18, { ...avenida, separacion_m: 5 })).toBeCloseTo(3, 5);
    expect(width(18, { ...avenida, separacion_m: 20 })).toBeCloseTo(9, 5);
    // Una avenida de una sola calzada no cambia.
    expect(width(18, { clase: 'primary' })).toBeCloseTo(9, 5);
  });
});
