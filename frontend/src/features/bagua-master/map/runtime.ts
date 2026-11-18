import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre y el protocolo PMTiles se cargan bajo demanda y se registran una sola vez, para
// compartirlos entre el mapa principal y las miniaturas de los expedientes.
let pmtilesRegistered = false;
export async function loadMapRuntime() {
  const [maplibre, pmtiles] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  maplibre.setWorkerUrl(workerUrl);
  if (!pmtilesRegistered) {
    maplibre.addProtocol('pmtiles', new pmtiles.Protocol().tile);
    pmtilesRegistered = true;
  }
  return maplibre;
}
