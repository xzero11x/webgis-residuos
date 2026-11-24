import { expect, test } from '@playwright/test';

test('apariencia bajo demanda, teclado y cámara conservada', async ({ page }) => {
  await page.goto('/bagua-master');
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
  const zoom = await map.getAttribute('data-zoom');
  const trigger = page.getByRole('button', { name: 'Estilo del mapa: Positron', exact: true });
  await expect(page.getByRole('menuitemradio')).toHaveCount(0);
  await trigger.click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(6);
  await expect(page.getByRole('menuitemradio', { name: 'Monocromo', exact: true })).toBeVisible();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(map).toHaveAttribute('data-theme', 'dark');
  await expect(map).toHaveAttribute('data-zoom', zoom!);
  await expect(page.getByRole('menuitemradio')).toHaveCount(0);
  const next = page.getByRole('button', { name: 'Estilo del mapa: Dark', exact: true });
  await expect(next).toBeFocused();
  await next.click();
  await page.keyboard.press('Escape');
  await expect(next).toBeFocused();
  await expect(page.getByTestId('bm-modo-3d')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('vista 2.5D conserva cámara al cambiar apariencia y permite ocultar simulaciones', async ({
  page,
  request,
}) => {
  const summary = await (await request.get('/api/bagua-master/resumen')).json();
  test.skip(
    summary.alturas.conAltura + summary.alturas.conEstimacion + summary.alturas.conSimulacion === 0,
    'Requiere alturas importadas con el procedimiento documentado.',
  );
  await page.goto('/bagua-master');
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
  const response = page.waitForResponse((r) => r.url().includes('/alturas/mapa') && r.ok());
  await page.getByTestId('bm-modo-3d').click();
  const heights = await (await response).json();
  expect(heights.features.length).toBeGreaterThan(0);
  await expect(map).toHaveAttribute('data-modo', '2.5d');
  await expect.poll(async () => Number(await map.getAttribute('data-pitch'))).toBeGreaterThan(30);
  await page.getByRole('button', { name: 'Estilo del mapa: Positron', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Fjord', exact: true }).click();
  await expect(map).toHaveAttribute('data-theme', 'fjord');
  await expect.poll(async () => Number(await map.getAttribute('data-pitch'))).toBeGreaterThan(30);
  await page.getByText('Vista 2.5D · origen de las alturas', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Mostrar simuladas/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /Mostrar simuladas/ }).check();
  await expect(page.getByRole('checkbox', { name: /Mostrar simuladas/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /Mostrar simuladas/ }).uncheck();
  await page.getByTestId('bm-modo-3d').click();
  await expect.poll(async () => Number(await map.getAttribute('data-pitch'))).toBe(0);
});
