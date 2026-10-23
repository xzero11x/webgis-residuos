import { expect, test, type Page } from '@playwright/test';

const TOMAQUE = 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg';
type Feature = { properties: Record<string, unknown> };
const LAYERS = [
  'Trazos de bloques no insertados · por revisar',
  'Puntos topográficos · por revisar',
  'Manzanas y calles RPU · por revisar',
  'Toponimia CAD · por revisar',
  'Ventanas de hojas · por revisar',
  'Cotas del dibujo',
  'Rótulos de lote · zoom alto',
];

test('segunda pasada: procedencia, CRS provisional y rutas sin fusionar', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Una comprobación de datos es suficiente.');
  const summary = await (await request.get('/api/municipal/segunda-pasada')).json();
  expect(summary.checksum).toBeTruthy();
  expect(summary.audit.pendingDecisions.length).toBeGreaterThanOrEqual(2);
  const get = async (capa: string) =>
    (await (await request.get(`/api/municipal/segunda-pasada/${capa}`)).json())
      .features as Feature[];
  const blocks = await get('rutas-bloques');
  expect(blocks.length).toBe(3110);
  for (const { properties: p } of blocks) {
    expect(p.status).toBe('por revisar');
    expect(p.crsStatus).toBe('provisional');
    expect(String(p.crs)).toContain('Bloque no insertado');
  }
  expect(blocks.some((f) => f.properties.capa === 'SECT. JERUZALEN')).toBe(true);
  const points = await get('puntos-topograficos');
  expect(points.filter((f) => f.properties.cota_utilizable).length).toBe(1025);
  for (const { properties: p } of points)
    expect(p.cota_utilizable).toBe(String(p.cota_estado).startsWith('coincide'));
  const manzanas = await get('manzanas');
  const rpu = manzanas.filter((f) => (f.properties.calles_colindantes as string[]).length);
  expect(rpu.length).toBe(53);
  expect(rpu.every((f) => f.properties.status === 'por revisar')).toBe(true);
  for (const capa of ['toponimia', 'hojas-planos', 'cotas']) {
    const features = await get(capa);
    expect(features.length).toBeGreaterThan(0);
    for (const { properties: p } of features) {
      expect(p.crs).toBeTruthy();
      expect(p.source).toBeTruthy();
      // Tomaque's measured translation is the adopted CRS; block routes stay provisional.
      if (p.source === TOMAQUE) expect(p.crsStatus).toBe('adoptado');
      if (capa !== 'cotas') expect(p.status).toBe('por revisar');
    }
  }
  expect((await request.get('/api/municipal/segunda-pasada/etiquetas-lote')).status()).toBe(400);
  const labels = await request.get(
    '/api/municipal/segunda-pasada/etiquetas-lote?bbox=-78.545,-5.645,-78.525,-5.625',
  );
  expect(labels.ok()).toBe(true);
  for (const { properties: p } of (await labels.json()).features as Feature[])
    expect(String(p.texto)).not.toMatch(/CERTIF|POSESI|POSECI|SUCESI|RESOLUCI/i);
  // Recovered sketches are not municipal routes.
  const routes = (await (await request.get('/api/capas')).json()).rutas.features as Feature[];
  expect(routes.some((r) => /JERU|bloque/i.test(String(r.properties.nombre)))).toBe(false);
});

async function openLayers(page: Page) {
  await page.locator('.layer-control > summary').click();
}

async function clickReviewFeature(page: Page) {
  const box = (await page.getByTestId('territorial-map').boundingBox())!;
  const panel = page.locator('.second-pass-detail');
  // Only sample points where the map canvas is not covered by panels.
  const points: [number, number][] = [];
  for (let fy = 0.1; fy < 0.95; fy += 0.08)
    for (let fx = 0.05; fx < 1; fx += 0.08)
      points.push([box.x + box.width * fx, box.y + box.height * fy]);
  const exposed = await page.evaluate(
    (candidates) =>
      candidates.filter(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS'),
    points,
  );
  for (const [x, y] of exposed) {
    await page.mouse.click(x, y);
    if (await panel.isVisible().catch(() => false)) return;
    const other = page.getByRole('button', { name: 'Cerrar información de capa' });
    if (await other.isVisible().catch(() => false)) await other.click();
  }
  throw new Error('No se encontró un elemento de la segunda pasada para abrir.');
}

test('modo Técnico: capas de la segunda pasada apagadas, ficha con procedencia', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'tablet', 'Escritorio y móvil cubren los dos diseños.');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const map = page.getByTestId('territorial-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
  await openLayers(page);
  await expect(page.getByText('Segunda pasada DWG · solo lectura')).toHaveCount(0);
  await openLayers(page);
  await page.getByRole('button', { name: 'Técnico', exact: true }).click();
  await openLayers(page);
  for (const name of LAYERS)
    await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  for (const name of [LAYERS[0], LAYERS[1], LAYERS[2], LAYERS[4]])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await openLayers(page);
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await expect
    .poll(async () => Number(await map.getAttribute('data-second-pass')))
    .toBeGreaterThan(0);
  // The legend starts collapsed on phones to keep the map usable.
  const legend = page.locator('.second-pass-legend');
  const collapsed = !(await legend.evaluate((e) => (e as HTMLDetailsElement).open));
  if (collapsed) await legend.locator('summary').click();
  await expect(legend.getByText(/Traslación adoptada como CRS de Tomaque/)).toBeVisible();
  if (collapsed) await legend.locator('summary').click();
  await clickReviewFeature(page);
  const panel = page.locator('.second-pass-detail');
  await expect(panel.getByText(/^(POR REVISAR|DOCUMENTAL CAD)$/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Procedencia' })).toBeVisible();
  await expect(panel.locator('.second-pass-crs')).toContainText(/EPSG:32717/);
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-segunda-pasada.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cerrar información de capa' }).click();

  // Lot labels: only requested for the visible window from zoom 17.
  const lots = page.waitForResponse((r) =>
    r.url().includes('/segunda-pasada/etiquetas-lote?bbox='),
  );
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await openLayers(page);
  await page.getByRole('checkbox', { name: LAYERS[6], exact: true }).check();
  await openLayers(page);
  expect((await lots).ok()).toBe(true);
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-segunda-pasada-lotes.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Operativo', exact: true }).click();
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-second-pass', '0');
  await page.getByRole('button', { name: 'Técnico', exact: true }).click();
  await openLayers(page);
  for (const name of LAYERS)
    await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
