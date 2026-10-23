/* global document */
// Capturas de las rutas de recolección en BAGUA MASTER: todas, una destacada y su ficha.
// Uso: node scripts/bagua-master/capturar_rutas.mjs <carpeta>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';
const dir = process.argv[2] ?? 'artifacts/screenshots/bagua-master/rutas';
const ROUTES = ['MUN-1001', 'MUN-2001', 'MUN-2002', 'CAD-2026', 'CAD-PRIMAVERA', 'MUN-ORGANICA'];
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
  const idle = async () => {
    await page.waitForTimeout(400);
    await page.waitForFunction(
      () => document.querySelector('[data-testid=bagua-master-map]')?.dataset.idle === 'true',
      null,
      { timeout: 60000 },
    );
    await page.waitForTimeout(500);
  };
  await page.goto(`${BASE}/bagua-master`);
  await page.waitForFunction(
    () => document.querySelector('[data-testid=bagua-master-map]')?.dataset.ready === 'true',
    null,
    { timeout: 60000 },
  );
  await idle();
  await page.getByTestId('bm-rutas-boton').click();
  await page.getByTestId('bm-rutas-panel').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/${device}-lista.png` });
  for (const code of ROUTES) {
    await page.getByTestId(`bm-ruta-${code}`).click();
    await idle();
    await page.screenshot({ path: `${dir}/${device}-${code}.png` });
    await page.getByTestId('bm-rutas-todas').click();
  }
}
await browser.close();
console.log('capturas en', dir);
