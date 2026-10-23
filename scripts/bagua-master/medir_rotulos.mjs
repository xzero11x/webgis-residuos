/* global window, document */
// Mide, en el navegador real, cuántas calles con nombre de Overture reciben su rótulo.
// Para cada zona y zoom compara las vías con nombre dibujadas (capa bm-vias) con los rótulos
// colocados (capa bm-calles-texto). Distingue «sin dato» (calle sin nombre en Overture) de
// «error de visualización» (calle con nombre sin rótulo colocado).
// Uso: node scripts/bagua-master/medir_rotulos.mjs [salida.json]   (pila en PLAYWRIGHT_BASE_URL)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';
const zonas = JSON.parse(
  readFileSync(new URL('../../data/bagua-master/nombres/zonas.json', import.meta.url)),
);
const VIEWS = [
  { zona: 'Bagua Capital', centro: [-78.5306, -5.6356] },
  { zona: 'Tomaque', centro: [-78.5057, -5.6489] },
  ...zonas.zonas
    .filter((z) => z.nombre.startsWith('Núcleo'))
    .map((z) => ({ zona: z.nombre, centro: z.centro })),
];
const ZOOMS = [15, 16, 17, 18, 19, 20];
const DEVICES = {
  escritorio: { viewport: { width: 1440, height: 900 } },
  celular: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

// ESTILO=antes: reproduce el rótulo anterior (sobre red_vial, sin la capa auxiliar) para comparar.
const OLD_STYLE = process.env.ESTILO === 'antes';
const APPLY_OLD = () => {
  const m = window.__bm;
  m.removeLayer('bm-calles-texto');
  m.removeLayer('bm-rutas-texto');
  m.addLayer(
    {
      id: 'bm-calles-texto',
      type: 'symbol',
      source: 'overture',
      'source-layer': 'red_vial',
      minzoom: 14.5,
      filter: ['has', 'nombre'],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'nombre'],
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 12, 16, 14, 18, 17],
        'text-padding': 4,
        'symbol-spacing': 320,
        'text-max-angle': 35,
      },
      paint: { 'text-color': '#24231f', 'text-halo-color': '#ffffff', 'text-halo-width': 2.4 },
    },
    'bm-terreno-texto',
  );
};

const FIND_MAP = () => {
  const el = document.querySelector('[data-testid=bagua-master-map]');
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  const seen = new Set();
  const stack = [el[key]];
  while (stack.length) {
    const f = stack.pop();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    let h = f.memoizedState;
    let n = 0;
    while (h && n++ < 50) {
      const v = h.memoizedState;
      if (
        v &&
        typeof v === 'object' &&
        'current' in v &&
        v.current &&
        typeof v.current.queryRenderedFeatures === 'function'
      ) {
        window.__bm = v.current;
        return true;
      }
      h = h.next;
    }
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
    if (f.return) stack.push(f.return);
  }
  return false;
};

const MEASURE = async ({ center, zoom }) => {
  const m = window.__bm;
  m.jumpTo({ center, zoom });
  await new Promise((r) => {
    const tick = () => (m.loaded() && !m.isMoving() ? r() : setTimeout(tick, 100));
    setTimeout(tick, 250);
  });
  await new Promise((r) => setTimeout(r, 700));
  // Por nombre de calle (no por tramo): una calle está «rotulada» si su nombre aparece colocado
  // en pantalla. Se cuentan también los tramos con nombre dibujados y los rótulos colocados.
  // Solo la zona central de la pantalla (25 % de margen): una calle que apenas asoma por el borde
  // no puede mostrar su rótulo y falsearía la medida.
  const w = m.getCanvas().clientWidth;
  const h = m.getCanvas().clientHeight;
  const inner = [
    [w * 0.25, h * 0.25],
    [w * 0.75, h * 0.75],
  ];
  const named = new Map();
  let segments = 0;
  const seen = new Set();
  for (const f of m.queryRenderedFeatures(inner, { layers: ['bm-vias', 'bm-senderos'] })) {
    if (seen.has(f.properties.id)) continue;
    seen.add(f.properties.id);
    segments++;
    if (f.properties.nombre)
      named.set(f.properties.nombre, (named.get(f.properties.nombre) ?? 0) + 1);
  }
  const placed = m.queryRenderedFeatures(inner, { layers: ['bm-calles-texto'] });
  const labelled = new Set(placed.map((f) => f.properties.nombre));
  const routeLabels = m.queryRenderedFeatures(inner, { layers: ['bm-rutas-texto'] }).length;
  const segmentsNamed = [...named.values()].reduce((a, b) => a + b, 0);
  const missing = [...named.keys()].filter((n) => !labelled.has(n));
  return {
    tramos: segments,
    tramos_con_nombre: segmentsNamed,
    tramos_sin_nombre: segments - segmentsNamed,
    calles_con_nombre: named.size,
    calles_rotuladas: [...named.keys()].filter((n) => labelled.has(n)).length,
    calles_con_nombre_sin_rotulo: missing.length,
    rotulos_colocados: placed.length,
    rotulos_de_ruta: routeLabels,
    sin_rotulo: missing,
  };
};

const browser = await chromium.launch();
const result = { base: BASE, dispositivos: {} };
for (const [device, options] of Object.entries(DEVICES)) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(`${BASE}/bagua-master`);
  await page.waitForSelector('[data-testid=bagua-master-map]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid=bagua-master-map]').dataset.ready === 'true',
    null,
    { timeout: 60000 },
  );
  if (!(await page.evaluate(FIND_MAP))) throw new Error('No se encontró la instancia de MapLibre');
  if (OLD_STYLE) await page.evaluate(APPLY_OLD);
  const rows = [];
  for (const view of VIEWS) {
    for (const zoom of ZOOMS) {
      const r = await page.evaluate(MEASURE, { center: view.centro, zoom });
      rows.push({ zona: view.zona, zoom, ...r });
    }
  }
  result.dispositivos[device] = rows;
  await context.close();
}
await browser.close();
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(result, null, 1));
for (const [device, rows] of Object.entries(result.dispositivos)) {
  console.log(`== ${device}`);
  for (const r of rows.filter(
    (x) => x.zona === 'Bagua Capital' || x.zona === 'Tomaque' || x.calles_con_nombre,
  )) {
    console.log(
      `${r.zona.padEnd(32)} z${String(r.zoom).padEnd(2)} tramos ${String(r.tramos).padStart(4)} (sin nombre ${String(r.tramos_sin_nombre).padStart(3)})  calles con nombre ${String(r.calles_con_nombre).padStart(3)}  rotuladas ${String(r.calles_rotuladas).padStart(3)}  sin rótulo ${String(r.calles_con_nombre_sin_rotulo).padStart(3)}  rótulos ${String(r.rotulos_colocados).padStart(3)}  ruta ${r.rotulos_de_ruta}`,
    );
  }
}
