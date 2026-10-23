import { expect, test } from '@playwright/test';

test('ruta 2026 recuperada y consulta CAD por archivo', async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const data = await (await request.get('/api/capas')).json();
  const route = data.rutas.features.find(
    (f: { properties: { codigo: string } }) => f.properties.codigo === 'CAD-2026',
  );
  expect(route.geometry.coordinates).toHaveLength(64);
  expect(route.properties.metadata.labelReferences).toHaveLength(6);
  const inventory = await (await request.get('/api/municipal/cad-inventario')).json();
  expect(new Set(inventory.layers.map((l: { source: string }) => l.source)).size).toBe(6);
  expect((await request.get('/api/municipal/cad-revision?archivo=x&capa=x')).status()).toBe(400);
  const review = await request.get(
    '/api/municipal/cad-revision?' +
      new URLSearchParams({
        archivo: route.properties.source,
        capa: 'COTAS',
        bbox: '-78.515,-5.66,-78.495,-5.64',
      }),
  );
  expect(review.ok()).toBe(true);
  expect(
    (await review.json()).features.some(
      (f: { properties: { ref: string } }) => f.properties.ref === '989930EF',
    ),
  ).toBe(true);
  await page.goto('/');
  const map = page.getByTestId('territorial-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
  await page.locator('input[type=search]:visible').fill('2026');
  await expect(page.locator('.route-result')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Ver Ruta 2026 · Tomaque, Brujo Pata y Casuarinas', exact: true })
    .click();
  await expect(map).toHaveAttribute('data-focused', route.properties.id);
  await expect
    .poll(async () => Number(await map.getAttribute('data-directions')))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-ruta-2026.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cerrar información de capa' }).click();
  await page.getByRole('button', { name: 'Técnico', exact: true }).click();
  await page.locator('.layer-control > summary').click();
  await page.getByRole('checkbox', { name: 'Ver geometrías por archivo y capa' }).check();
  await expect(page.getByRole('combobox', { name: 'Archivo DWG' })).toHaveValue(
    route.properties.source,
  );
  await page.getByRole('combobox', { name: 'Archivo DWG' }).selectOption('COFOPRI BAGUA.dwg');
  await expect(page.locator('.cad-inspector')).toContainText('CRS adoptado el 16/10/2026');
  const cofopri = inventory.audit.sources.find(
    (s: { source: string }) => s.source === 'COFOPRI BAGUA.dwg',
  );
  expect(cofopri.crsStatus).toBe('adoptado');
  expect(cofopri.alignment.vertices_within_5cm).toBeGreaterThan(10000);
  expect(
    inventory.layers
      .filter((l: { source: string }) => l.source === 'COFOPRI BAGUA.dwg')
      .every((l: { total: number; mapped: number }) => l.mapped === l.total),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-cad-inspector.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
