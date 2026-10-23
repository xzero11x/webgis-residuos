import { expect, test } from '@playwright/test';

test('símbolos documentales: excluye leyendas y conserva evidencia de dirección', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Una comprobación de datos es suficiente.');
  const response = await request.get('/api/municipal/cartografia');
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const count = (kind: string) =>
    data.features.filter((f: { properties: { kind: string } }) => f.properties.kind === kind)
      .length;
  // 739 CAD arrows (block 15C9C) + filled symbols read from three route PDFs.
  expect(count('sentido')).toBe(1251);
  const pdfArrows = (route: string) =>
    data.features.filter(
      (f: { properties: { kind: string; routeCode: string; source: string } }) =>
        f.properties.kind === 'sentido' &&
        f.properties.routeCode === route &&
        f.properties.source.endsWith('.pdf'),
    ).length;
  expect(pdfArrows('MUN-COMERCIAL')).toBe(84);
  expect(pdfArrows('MUN-2001')).toBe(145);
  expect(pdfArrows('MUN-INSTITUCIONAL')).toBe(45);
  expect(count('parada')).toBe(26);
  expect(count('inicio')).toBe(4);
  expect(count('fin')).toBe(3);
  for (const f of data.features) {
    expect(f.properties.ref).toBeTruthy();
    expect(f.properties.routeCode).not.toBe('MUN-1007');
    if (f.properties.kind === 'sentido') {
      const p = f.properties;
      if (p.routeCode === 'CAD-2026') expect(p.symbolRef).toBe('98993125');
      else expect(p.legendRef).toContain(p.source.endsWith('.pdf') ? 'PDF' : '15C9C');
      expect(p.bearing).toBeGreaterThanOrEqual(0);
      expect(p.bearing).toBeLessThan(360);
      expect(p.baseUtm).not.toEqual(p.tipUtm);
    }
    if (['zona', 'horario', 'revision'].includes(f.properties.kind))
      expect(f.properties.status).toBe('revision');
  }
  expect(
    data.features.some((f: { properties: { ref: string } }) => f.properties.ref === '2A157'),
  ).toBe(false);
  const routes = (await (await request.get('/api/capas')).json()).rutas.features;
  expect(
    routes.find((r: { properties: { codigo: string } }) => r.properties.codigo === 'MUN-2002')
      .properties.color,
  ).toBe('#e87925');
});

test('modo Operativo y Técnico: ruta, leyenda, capas y ficha adaptable', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const map = page.getByTestId('territorial-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
  await expect(map).toHaveAttribute('data-mode', 'operativo');
  await page.getByRole('button', { name: 'Ver Ruta 1001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ruta 1001', exact: true })).toBeVisible();
  await expect(map).not.toHaveAttribute('data-focused', '');
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await expect
    .poll(async () => Number(await map.getAttribute('data-directions')))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-operativo.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cerrar información de capa' }).click();
  await page.getByRole('button', { name: 'Técnico', exact: true }).click();
  await expect(map).toHaveAttribute('data-mode', 'tecnico');
  await page.locator('.layer-control > summary').click();
  await page
    .getByRole('checkbox', { name: 'Áreas de cobertura · por revisar', exact: true })
    .check();
  await page
    .getByRole('checkbox', { name: 'Horarios del plano · sin validar', exact: true })
    .check();
  await page.locator('.layer-control > summary').click();
  await page.getByRole('button', { name: 'Ver La Primavera · trazo CAD', exact: true }).click();
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-tecnico.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Operativo', exact: true }).click();
  await expect(map).toHaveAttribute('data-mode', 'operativo');
  await expect(
    page.getByRole('button', { name: 'Ver La Primavera · trazo CAD', exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
