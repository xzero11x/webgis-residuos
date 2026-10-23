import { expect, test } from '@playwright/test';

test('archivo municipal: rutas persistidas, procedencia y separación de datos', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'La integridad de datos no depende del viewport.');
  const summary = await (await request.get('/api/municipal/resumen')).json();
  const original = summary.imports.find(
    (i: { dataset: string }) => i.dataset === 'municipal-cad-v1',
  );
  expect(original.sources).toHaveLength(12);
  expect(original.statistics.uniqueEntities).toBeGreaterThan(80000);
  const { rutas } = await (await request.get('/api/capas')).json();
  const municipal = rutas.features.filter(
    (r: { properties: { isDemo: boolean } }) => !r.properties.isDemo,
  );
  expect(municipal).toHaveLength(9);
  for (const r of municipal) {
    expect(r.geometry.type).toBe('MultiLineString');
    expect(r.properties.horario).toBeNull();
    expect(r.properties.frecuencia).toBeNull();
    expect(r.properties.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(r.properties.metadata.references.length).toBeGreaterThan(0);
    for (const line of r.geometry.coordinates)
      for (const [lng, lat] of line) {
        expect(lng).toBeGreaterThan(-78.6);
        expect(lng).toBeLessThan(-78.45);
        expect(lat).toBeGreaterThan(-5.7);
        expect(lat).toBeLessThan(-5.59);
      }
  }
  const institutional = municipal.find(
    (r: { properties: { codigo: string } }) => r.properties.codigo === 'MUN-INSTITUCIONAL',
  );
  // Tomaque's measured translation is the adopted CRS (16 Oct 2026).
  expect(institutional.properties.nombre).toBe('Ruta Tomaque – Brujo Pata – Casuarinas');
  expect(institutional.properties.status).toBe('georreferenciada');
  expect(institutional.properties.metadata.crsEvidence).toContain('adoptado');
  expect(institutional.properties.metadata.tomaqueTranslation).toMatchObject({
    dE: 3.589,
    dN: 2.352,
  });
  expect(institutional.properties.metadata.registration).toHaveLength(4);
  expect(institutional.properties.metadata.warnings[0]).toContain('11:08');
  const refs = await (await request.get('/api/municipal/referencias?clase=lote_cad')).json();
  expect(refs.features.length).toBeGreaterThan(6000);
  expect(refs.truncated).toBe(false);
  expect(refs.features[0].properties.note).toContain('No es un predio');
  expect((await request.get('/api/municipal/referencias?clase=invalid')).status()).toBe(400);
  expect((await (await request.get('/api/predios?q=DEMO-')).json()).total).toBe(24);
});

test('buscar rutas, seleccionar, revisar procedencia y activar CAD en todos los tamaños', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
    timeout: 60000,
  });
  await expect(page.getByRole('button', { name: 'Ver Ruta 1001', exact: true })).toBeVisible();
  await page.locator('input[type=search]:visible').fill('comercial');
  await expect(page.locator('.route-result')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver Ruta comercial', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha de capa' });
  await expect(panel).toContainText('RUTA DE RECICLAJE  COMERCIAL-A0.pdf');
  await expect(panel).toContainText('Por confirmar con la Gerencia');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Expandir ficha de capa' }).click();
  await panel.getByText('Calidad y referencias', { exact: true }).click();
  await expect(panel).toContainText('No equivale a precisión en terreno');
  await expect(page.getByTestId('territorial-map')).not.toHaveAttribute('data-focused', '');
  await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-idle', 'true', {
    timeout: 20000,
  });
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-ruta-comercial.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cerrar información de capa' }).click();
  await page.locator('input[type=search]:visible').fill('');
  await page
    .getByRole('button', { name: 'Ver Ruta Tomaque – Brujo Pata – Casuarinas', exact: true })
    .click();
  await expect(panel).toContainText('ARCHIVO MUNICIPAL');
  await expect(panel).toContainText('11:08 am');
  await page.getByRole('button', { name: 'Cerrar información de capa' }).click();
  await page.getByRole('button', { name: 'Mostrar 3 trazados pendientes de revisión' }).click();
  await page.getByRole('button', { name: 'Ver La Primavera · trazo CAD', exact: true }).click();
  await expect(panel).toContainText('PENDIENTE DE REVISIÓN');
  await page.getByRole('button', { name: 'Cerrar información de capa' }).click();
  await page.locator('.layer-control > summary').click();
  const response = page.waitForResponse((r) =>
    r.url().includes('/municipal/referencias?clase=lote_cad'),
  );
  await page.getByRole('checkbox', { name: 'Contornos CAD', exact: true }).check();
  expect((await response).status()).toBe(200);
  await page.getByRole('checkbox', { name: 'Anotaciones del plano', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Trazados por revisar', exact: true }).uncheck();
  await page.locator('.layer-control > summary').click();
  // 1001, 2001, 2002, comercial, Tomaque institucional y Ruta 2026 (conciliación).
  await expect(page.locator('.route-result')).toHaveCount(6);
  await page.getByRole('button', { name: 'Ver Ruta 1001', exact: true }).click();
  await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-idle', 'true', {
    timeout: 20000,
  });
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-rutas-cad.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
