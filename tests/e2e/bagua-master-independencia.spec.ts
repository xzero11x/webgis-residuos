import { expect, test } from '@playwright/test';

// Se ejecuta con scripts/bagua-master/independencia.mjs, que compila el frontend con un
// módulo desactivado (INDEPENDENCIA=sin-bagua-master | sin-mapa-municipal).
const scenario = process.env.INDEPENDENCIA;

test.describe('Independencia de los módulos cartográficos', () => {
  test.skip(!scenario, 'Solo con scripts/bagua-master/independencia.mjs');

  test('sin BAGUA MASTER: el mapa municipal funciona igual', async ({ page }) => {
    test.skip(scenario !== 'sin-bagua-master');
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible())
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await expect(page.getByRole('link', { name: 'Mapa general', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /BAGUA MASTER/ })).toHaveCount(0);
    await page.goto('/bagua-master');
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
    expect(
      requests.filter((u) => /bagua-master|pmtiles/.test(u) && !u.endsWith('/bagua-master')),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('sin mapa municipal: BAGUA MASTER funciona igual', async ({ page }) => {
    test.skip(scenario !== 'sin-mapa-municipal');
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page).toHaveURL(/\/bagua-master$/);
    await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible())
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await expect(page.getByRole('link', { name: /BAGUA MASTER/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mapa general', exact: true })).toHaveCount(0);
    expect(
      requests.filter((u) => /\/api\/(municipal|capas|predios|territorio|catalogos)/.test(u)),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
});
