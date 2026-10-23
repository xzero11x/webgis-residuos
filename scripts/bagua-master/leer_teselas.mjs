// Lee las PMTiles de BAGUA MASTER (solo lectura) y vuelca las vías de la capa `red_vial`:
// por cada elemento (id Overture), el nombre que viaja en las teselas y su longitud real en cada zoom.
// Uso: node scripts/bagua-master/leer_teselas.mjs [salida.json]
// Sirve para comprobar que ningún nombre se pierde al teselar y para medir los tramos.
import { writeFileSync, openSync, readSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as PbfModule from 'pbf';
const Pbf =
  PbfModule.default ??
  PbfModule.Pbf ??
  Object.values(PbfModule).find((v) => typeof v === 'function');
import { PMTiles } from 'pmtiles';

const FILE = process.argv[3]
  ? pathToFileURL(process.argv[3])
  : new URL('../../data/bagua-master/teselas/bagua-master.pmtiles', import.meta.url);
const out = process.argv[2];

class FileSource {
  constructor(path) {
    this.path = path;
    this.fd = openSync(path, 'r');
  }
  getKey() {
    return this.path;
  }
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length);
    readSync(this.fd, buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
  }
}

function readValue(pbf, end) {
  let v = null;
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1) v = pbf.readString();
    else if (field === 2) v = pbf.readFloat();
    else if (field === 3) v = pbf.readDouble();
    else if (field === 4) v = pbf.readVarint(true);
    else if (field === 5) v = pbf.readVarint();
    else if (field === 6) v = pbf.readSVarint();
    else if (field === 7) v = pbf.readBoolean();
    else pbf.skip(tag & 7);
  }
  return v;
}

function decodeLayer(pbf, end) {
  const layer = { name: '', keys: [], values: [], features: [], extent: 4096 };
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1) layer.name = pbf.readString();
    else if (field === 2) layer.features.push(decodeFeature(pbf, pbf.readVarint() + pbf.pos));
    else if (field === 3) layer.keys.push(pbf.readString());
    else if (field === 4) {
      const n = pbf.readVarint();
      layer.values.push(readValue(pbf, pbf.pos + n));
    } else if (field === 5) layer.extent = pbf.readVarint();
    else pbf.skip(tag & 7);
  }
  return layer;
}

function decodeFeature(pbf, end) {
  const f = { tags: [], type: 0, geom: [] };
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1) f.id = pbf.readVarint();
    else if (field === 2) {
      const e = pbf.readVarint() + pbf.pos;
      while (pbf.pos < e) f.tags.push(pbf.readVarint());
    } else if (field === 3) f.type = pbf.readVarint();
    else if (field === 4) {
      const e = pbf.readVarint() + pbf.pos;
      while (pbf.pos < e) f.geom.push(pbf.readVarint());
    } else pbf.skip(tag & 7);
  }
  return f;
}

/** Longitud de una línea en unidades de tesela (extent). */
function lineLength(geom) {
  let x = 0;
  let y = 0;
  let px;
  let py;
  let total = 0;
  let i = 0;
  while (i < geom.length) {
    const cmd = geom[i] & 7;
    const count = geom[i] >> 3;
    i++;
    for (let k = 0; k < count; k++) {
      const dx = geom[i++];
      const dy = geom[i++];
      x += (dx >> 1) ^ -(dx & 1);
      y += (dy >> 1) ^ -(dy & 1);
      if (cmd === 2 && px !== undefined) total += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
  }
  return total;
}

const archive = new PMTiles(new FileSource(FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const header = await archive.getHeader();
const result = {
  header: { minZoom: header.minZoom, maxZoom: header.maxZoom, numTiles: header.numAddressedTiles },
  layers: {},
  red_vial: [],
};
for (let z = header.minZoom; z <= header.maxZoom; z++) {
  const n = 2 ** z;
  // Cobertura de la descarga (con margen): -78.585..-78.48, -5.70..-5.59.
  const x0 = Math.floor(((-78.585 + 180) / 360) * n) - 1;
  const x1 = Math.floor(((-78.48 + 180) / 360) * n) + 1;
  const lat = (la) =>
    (1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) /
    2;
  const y0 = Math.floor(lat(-5.59) * n) - 1;
  const y1 = Math.floor(lat(-5.7) * n) + 1;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const tile = await archive.getZxy(z, x, y);
      if (!tile) continue;
      let data = Buffer.from(tile.data);
      if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
      const pbf = new Pbf(data);
      while (pbf.pos < pbf.length) {
        const tag = pbf.readVarint();
        if (tag >> 3 !== 3) {
          pbf.skip(tag & 7);
          continue;
        }
        const layer = decodeLayer(pbf, pbf.readVarint() + pbf.pos);
        const stats = (result.layers[layer.name] ??= { features: 0, tiles: 0, byZoom: {} });
        stats.tiles++;
        stats.features += layer.features.length;
        stats.byZoom[z] = (stats.byZoom[z] ?? 0) + layer.features.length;
        if (layer.name !== 'red_vial') continue;
        for (const f of layer.features) {
          const props = {};
          for (let t = 0; t < f.tags.length; t += 2)
            props[layer.keys[f.tags[t]]] = layer.values[f.tags[t + 1]];
          const metersPerUnit =
            (40075016.686 * Math.cos((-5.64 * Math.PI) / 180)) / n / layer.extent;
          result.red_vial.push({
            z,
            x,
            y,
            id: props.id,
            nombre: props.nombre ?? null,
            clase: props.clase ?? null,
            m: Math.round(lineLength(f.geom) * metersPerUnit * 10) / 10,
          });
        }
      }
    }
  }
}
result.red_vial_total = result.red_vial.length;
if (out) writeFileSync(out, JSON.stringify(result));
else console.log(JSON.stringify(result.layers, null, 1));
