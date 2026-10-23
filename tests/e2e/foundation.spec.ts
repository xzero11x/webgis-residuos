import { expect, test } from '@playwright/test';

test('API, PostGIS y Swagger responden', async ({ request, page }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  expect(await (await request.get('/api/ready')).json()).toMatchObject({
    status: 'ok',
    database: 'ok',
    postgis: 'ok',
  });
  const document = await (await request.get('/api/openapi.json')).json();
  expect(document.paths['/predios']).toBeDefined();
  await page.goto('/api/docs/');
  await expect(page.getByRole('heading', { name: /Bagua WebGIS/ })).toBeVisible();
  await expect(page.getByText('/predios', { exact: true }).first()).toBeVisible();
});

test('mapa real, búsqueda, ficha, filtros y capas responsive', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  await page.getByRole('tab', { name: 'Predios DEMO', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Mostrar lista de predios' });
  expect((await page.getByTestId('territorial-map').boundingBox())!.height).toBeGreaterThan(400);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(
    page.getByRole('button', { name: 'Ver predio DEMO-001', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-mapa.png`,
    fullPage: true,
  });
  await page.locator('input[type=search]:visible').fill('DEMO-001');
  await expect(page.locator('.predio-result')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver predio DEMO-001', exact: true }).click();
  const ficha = page.getByRole('complementary', { name: 'Ficha del predio' });
  await expect(ficha).toContainText('Persona de prueba 01');
  await expect(ficha).toContainText('R-DEMO-01');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Expandir ficha' }).click();
    await expect(page.getByRole('button', { name: 'Contraer ficha' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }
  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-ficha.png`,
    fullPage: true,
  });
  await page.locator('input[type=search]:visible').fill('DEMO-002');
  await expect(ficha).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Ver predio DEMO-002', exact: true }),
  ).toBeVisible();
  await page.locator('input[type=search]:visible').fill('DEMO-');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('Filtrar por servicio').selectOption({ label: 'Orgánicos' });
  await expect(page.locator('.predio-result')).toHaveCount(8);
  await expect(page.locator('.predio-result').first()).toContainText('Orgánicos');
  await page.getByLabel('Filtrar por ruta').selectOption({ index: 1 });
  await expect(page.locator('.predio-result')).toHaveCount(8);
  await page.getByLabel('Filtrar por sector').selectOption({ index: 1 });
  await expect(page).toHaveURL(/sector=/);
  await page.getByRole('button', { name: 'Técnico', exact: true }).click();
  await page.locator('.layer-control > summary').click();
  for (const label of ['Predios', 'Rutas', 'Puntos de recolección']) {
    await page.getByRole('checkbox', { name: label, exact: true }).uncheck();
    await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  // «Sectores» de la capa operativa (el grupo «Territorio unificado» tiene otro homónimo).
  await page.getByRole('checkbox', { name: 'Sectores', exact: true }).first().check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('dibujar, crear, editar, recargar y eliminar un predio en PostGIS', async ({
  page,
  request,
}, testInfo) => {
  const code = `E2E-${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  try {
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Nuevo predio', exact: true }).click();
    const canvas = page.locator('.maplibregl-canvas');
    const box = (await canvas.boundingBox())!;
    const x = box.width * 0.57,
      y = box.height * 0.42;
    for (const [dx, dy] of [
      [0, 0],
      [40, 0],
      [40, 40],
      [0, 40],
    ])
      await canvas.click({ position: { x: x + dx!, y: y + dy! } });
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Código del predio', { exact: true }).fill(code);
    await page.getByLabel('Dirección', { exact: true }).fill('Dirección de prueba E2E');
    await page.getByRole('button', { name: 'Añadir persona', exact: true }).click();
    await page.getByLabel('Nombre de persona 1').fill('Persona de prueba E2E');
    await page.getByLabel('Vínculo', { exact: true }).selectOption('Contribuyente');
    await page.getByRole('checkbox', { name: 'Orgánicos', exact: true }).check();
    await page.getByLabel('Ruta de orgánicos', { exact: true }).selectOption({ index: 1 });
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/predios') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Guardar predio', exact: true }).click();
    const created = await response;
    expect(created.status(), await created.text()).toBe(201);
    const createdId = (await created.json()).id;
    const ficha = page.getByRole('complementary', { name: 'Ficha del predio' });
    await expect(ficha).toContainText(code);
    await expect(ficha).toContainText('Contribuyente');
    await page.getByRole('button', { name: 'Editar predio', exact: true }).click();
    await page.getByLabel('Dirección', { exact: true }).fill('Dirección editada y persistida E2E');
    await page.getByRole('button', { name: 'Guardar predio', exact: true }).click();
    await expect(ficha).toContainText('Dirección editada y persistida E2E');
    await page.reload();
    await page.getByRole('tab', { name: 'Predios DEMO', exact: true }).click();
    await page.locator('input[type=search]:visible').fill(code);
    const toggle = page.getByRole('button', { name: 'Mostrar lista de predios' });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.getByRole('button', { name: `Ver predio ${code}`, exact: true }).click();
    await expect(ficha).toContainText('Dirección editada y persistida E2E');
    await expect(ficha).toContainText('R-DEMO-02');
    const stored = await (await request.get(`/api/predios/${createdId}`)).json();
    expect(stored.version).toBe(2);
    expect(stored.areaM2).toBeGreaterThan(1);
    expect(stored.geometry.type).toBe('Polygon');
    await page.getByRole('button', { name: 'Eliminar predio', exact: true }).click();
    await page.getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click();
    await expect(ficha).toHaveCount(0);
    expect((await request.get(`/api/predios/${createdId}`)).status()).toBe(404);
  } finally {
    const records = await (await request.get(`/api/predios?q=${code}`)).json();
    for (const item of records.items || [])
      if (item.codigo === code)
        await request.delete(`/api/predios/${item.id}`, { data: { version: item.version } });
  }
});

test('navegación y estado de conexión', async ({ page }) => {
  await page.goto('/');
  if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible())
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.getByRole('link', { name: 'Estado del sistema', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estado del sistema' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Conectado$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await expect(page.getByText('Acceso de desarrollo')).toBeVisible();
  await page.keyboard.press('Escape');
});
