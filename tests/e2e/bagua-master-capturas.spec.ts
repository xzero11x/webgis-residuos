import { expect, test, type Page } from '@playwright/test';

// Capturas de BAGUA MASTER para la documentación (CAPTURAS=1). No forma parte de la suite normal.
const dir = 'artifacts/screenshots/bagua-master';

async function idle(page: Page) {
  const map = page.getByTestId('bagua-master-map');
  await expect(map)
    .toHaveAttribute('data-idle', 'false', { timeout: 3_000 })
    .catch(() => {});
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30_000 });
}

test.describe('Capturas de BAGUA MASTER', () => {
  test.skip(!process.env.CAPTURAS, 'Solo con CAPTURAS=1');

  test('pantallas del módulo y del mapa anterior', async ({ page }, info) => {
    const p = info.project.name;
    await page.goto('/bagua-master');
    await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await idle(page);
    await page.screenshot({ path: `${dir}/${p}-01-inicio.png` });
    await page.getByRole('button', { name: 'Ver la extensión urbana' }).click();
    await idle(page);
    await page.screenshot({ path: `${dir}/${p}-02-vista-urbana.png` });
    await page
      .getByRole('searchbox', { name: 'Buscar calle o lugar en Bagua' })
      .fill('plaza de armas');
    await page.getByRole('button', { name: /Plaza de Armas Bagua/ }).click();
    await idle(page);
    await page.getByRole('button', { name: 'Acercar' }).click();
    await idle(page);
    await page.screenshot({ path: `${dir}/${p}-03-zoom-alto-ficha.png` });
    await page.getByRole('button', { name: 'Cerrar información' }).click();
    await page.getByTestId('bm-modo-3d').hover({ force: true });
    await page.screenshot({ path: `${dir}/${p}-04-estado-2-5d.png` });
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${dir}/${p}-05-mapa-anterior.png` });
  });

  test('serie de zoom: calles, edificios e intersecciones', async ({ page }, info) => {
    const p = info.project.name;
    const map = page.getByTestId('bagua-master-map');
    await page.goto('/bagua-master');
    await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await page
      .getByRole('searchbox', { name: 'Buscar calle o lugar en Bagua' })
      .fill('plaza de armas');
    await page.getByRole('button', { name: /Plaza de Armas Bagua/ }).click();
    await idle(page);
    await page.getByRole('button', { name: 'Cerrar información' }).click();
    // Cada paso espera a que el zoom cambie y el mapa termine de dibujar.
    const step = async (button: 'Acercar' | 'Alejar') => {
      const before = await map.getAttribute('data-zoom');
      await page.getByRole('button', { name: button }).click();
      await expect(map).not.toHaveAttribute('data-zoom', before!, { timeout: 10_000 });
      await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30_000 });
      return map.getAttribute('data-zoom');
    };
    for (let i = 0; i < 3; i++) await step('Alejar');
    await page.screenshot({ path: `${dir}/zoom/${p}-z${await map.getAttribute('data-zoom')}.png` });
    for (let i = 0; i < 6; i++) {
      const zoom = await step('Acercar');
      await page.screenshot({ path: `${dir}/zoom/${p}-z${zoom}.png` });
      if (zoom === '20.00') break;
    }
  });
});
