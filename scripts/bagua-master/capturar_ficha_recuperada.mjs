/* global window, document */
// Captura la ficha de una calle con nombre recuperado del DWG (escritorio y celular).
// Uso: node scripts/bagua-master/capturar_ficha_recuperada.mjs <carpeta>
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';
const dir = process.argv[2] ?? 'artifacts/screenshots/bagua-master/nombres/fichas';
const recovered = Object.keys(
  JSON.parse(readFileSync('data/bagua-master/nombres/nombres_dwg.json', 'utf8')).asociaciones,
);
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
  const point = await page.evaluate(
    async ({ recovered }) => {
      const m = window.__bm;
      m.jumpTo({ center: [-78.507, -5.6479], zoom: 17 });
      await new Promise((r) => {
        const tick = () => (m.loaded() && !m.isMoving() ? r() : setTimeout(tick, 100));
        setTimeout(tick, 250);
      });
      const ids = new Set(recovered);
      const box = m.getContainer().getBoundingClientRect();
      for (let y = 120; y < box.height - 120; y += 20)
        for (let x = 60; x < box.width - 100; x += 20) {
          const hit = m
            .queryRenderedFeatures([x, y], { layers: ['bm-vias'] })
            .find((f) => ids.has(String(f.properties.id)));
          if (hit) return { x: x + box.left, y: y + box.top };
        }
      return null;
    },
    { recovered },
  );
  if (!point) throw new Error('No se encontró un tramo recuperado en pantalla');
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('[data-testid=bm-info]');
  await page.waitForSelector('text=Nombre recuperado', { timeout: 8000 }).catch(async () => {
    throw new Error(
      'Ficha sin nombre recuperado: ' + (await page.locator('[data-testid=bm-info]').innerText()),
    );
  });
  await page.screenshot({ path: `${dir}/${device}-ficha-recuperada.png` });
  console.log(
    device,
    'ficha:',
    (await page.locator('[data-testid=bm-info]').innerText()).replace(/\n+/g, ' | '),
  );
}
await browser.close();
