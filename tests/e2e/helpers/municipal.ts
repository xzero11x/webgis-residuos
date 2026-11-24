import { test, type Page } from '@playwright/test';

/**
 * El visor municipal histórico de `/` está retirado: `/` lleva a BAGUA MASTER. Sus pruebas se
 * omiten cuando el visor no está habilitado (MUNICIPAL_MAP_ENABLED=false). La redirección ocurre
 * en el navegador, así que se espera lo que llegue primero: BAGUA MASTER o el mapa histórico.
 */
export async function openMunicipalViewer(page: Page) {
  await page.goto('/');
  const retired = await Promise.race([
    page.waitForURL(/\/bagua-master/, { timeout: 30_000 }).then(() => true),
    page
      .getByTestId('territorial-map')
      .waitFor({ state: 'attached', timeout: 30_000 })
      .then(() => false),
  ]).catch(() => false);
  test.skip(retired, 'Visor municipal histórico retirado de la aplicación.');
}
