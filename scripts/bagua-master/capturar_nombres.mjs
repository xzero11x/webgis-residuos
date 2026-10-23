/* global window, document */
// Capturas de calles con rótulo en BAGUA MASTER: zona × zoom × dispositivo.
// Uso: node scripts/bagua-master/capturar_nombres.mjs <carpeta> [zoom,zoom,...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';
const dir = process.argv[2] ?? 'artifacts/screenshots/bagua-master/nombres';
const zooms = (process.argv[3] ?? '16,17,18').split(',').map(Number);
const VIEWS = {
  capital: [-78.5306, -5.6356],
  tomaque: [-78.5057, -5.6489],
  'nucleo-oeste': [-78.5633, -5.6371],
  'nucleo-10-sureste': [-78.4804, -5.6872],
};
const DEVICES = {
  escritorio: { viewport: { width: 1280, height: 800 } },
  celular: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
for (const [device, options] of Object.entries(DEVICES)) {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto(`${BASE}/bagua-master`);
  await page.waitForFunction(
    () => document.querySelector('[data-testid=bagua-master-map]')?.dataset.ready === 'true',
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
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
        if (v && typeof v === 'object' && 'current' in v && v.current?.queryRenderedFeatures)
          window.__bm = v.current;
        h = h.next;
      }
      if (f.child) stack.push(f.child);
      if (f.sibling) stack.push(f.sibling);
      if (f.return) stack.push(f.return);
    }
  });
  for (const [name, center] of Object.entries(VIEWS)) {
    for (const zoom of zooms) {
      await page.evaluate(
        async ({ center, zoom }) => {
          const m = window.__bm;
          m.jumpTo({ center, zoom });
          await new Promise((r) => {
            const tick = () => (m.loaded() && !m.isMoving() ? r() : setTimeout(tick, 100));
            setTimeout(tick, 250);
          });
          await new Promise((r) => setTimeout(r, 700));
        },
        { center, zoom },
      );
      await page.screenshot({ path: `${dir}/${device}-${name}-z${zoom}.png` });
    }
  }
}
await browser.close();
console.log('capturas en', dir);
