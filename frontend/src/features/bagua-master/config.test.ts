import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLYPHS_URL, TILES_URL } from './config';

afterEach(() => vi.unstubAllGlobals());

describe('Base cartográfica permanente de BAGUA MASTER', () => {
  it('sirve las PMTiles de Overture y los glifos desde la API propia', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:8080' } });
    expect(TILES_URL()).toMatch(
      /^pmtiles:\/\/http:\/\/localhost:8080\/api\/bagua-master\/teselas\/bagua-master\.pmtiles\?v=/,
    );
    expect(GLYPHS_URL()).toBe(
      'http://localhost:8080/api/bagua-master/fuentes/{fontstack}/{range}.pbf',
    );
  });
});
