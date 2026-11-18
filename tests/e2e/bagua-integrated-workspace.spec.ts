import { requireFixtureTarget } from './helpers/fixture-target';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

function credentials(name: string) {
  const file = path.resolve('artifacts/accesos-locales', `${name}.txt`);
  if (!existsSync(file)) return null;
  const data = readFileSync(file, 'utf8');
  return {
    usuario: data.match(/^Usuario: (.+)$/m)![1],
    password: data.match(/^Contraseña: (.+)$/m)![1],
  };
}
const registrar = credentials('registro-bagua'),
  reader = credentials('consulta-bagua');
const headers = { 'X-Bagua-Request': '1' };
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Espacio de trabajo' });
const map = (page: Page) => page.getByTestId('bagua-master-map');
async function prepare(page: Page, located = false) {
  expect((await page.request.post('/api/gestion/sesion', { headers, data: registrar })).ok()).toBe(
    true,
  );
  const response = await page.request.post('/api/gestion/predios', {
    headers,
    data: {
      codigo: `E2E-CONTEXTO-${randomUUID().slice(0, 8)}`,
      direccion: 'Dirección sintética para ensayo integrado',
      ...(located
        ? {
            ubicacion: { type: 'Point', coordinates: [-78.5367, -5.6378] },
            estadoUbicacion: 'verificada',
            evidenciaUbicacion: 'Referencia de prueba; sin validación municipal.',
          }
        : {}),
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; codigo: string };
}
async function camera(page: Page) {
  await expect(map(page)).toHaveAttribute('data-idle', 'true', { timeout: 60000 });
  return await map(page).evaluate((element) => ({
    centro: element.dataset.centro,
    zoom: element.dataset.zoom,
    pitch: element.dataset.pitch,
  }));
}

test.describe('Entorno geográfico integrado', () => {
  test.skip(!registrar || !reader, 'Preparar accesos sintéticos locales.');
  test.beforeEach(async ({ request }) => {
    await requireFixtureTarget(request, registrar);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('el mapa permanece montado y conserva cámara y selección al ampliar la ficha', async ({
    page,
  }, info) => {
    const p = await prepare(page, true);
    await page.goto(`/bagua-master?predio=${p.id}`);
    await expect(map(page)).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    await expect(page.locator('.bm-predio-marker')).toBeVisible();
    await camera(page);
    await expect(page.locator('.desktop-sidebar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Acercar', exact: true }).click();
    const before = await camera(page);
    await map(page).evaluate((element) => {
      element.dataset.instanceCheck = 'same-map';
    });
    await page.getByRole('link', { name: 'Abrir ficha administrativa' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('article')).toContainText(p.codigo);
    await expect(page).toHaveURL(/\/bagua-master\?/);
    await expect(map(page)).toHaveAttribute('data-instance-check', 'same-map');
    await page.screenshot({
      path: `artifacts/screenshots/integrated-expanded-${info.project.name}.png`,
    });
    await dialog(page).getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(map(page)).toHaveAttribute('data-instance-check', 'same-map');
    expect(await camera(page)).toEqual(before);
    await expect(
      page.getByRole('complementary', { name: 'Ficha contextual del predio' }),
    ).toContainText(p.codigo);
    await page.screenshot({
      path: `artifacts/screenshots/integrated-map-${info.project.name}.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
  test('la entrega parte de su predio y aparece al volver al inspector', async ({ page }, info) => {
    const p = await prepare(page);
    const catalog = await (await page.request.get('/api/gestion/catalogos')).json();
    const response = await page.request.post(`/api/gestion/predios/${p.id}/participaciones`, {
      headers,
      data: {
        servicioId: catalog.servicios[0].id,
        periodo: { desde: '2026-01-01', hasta: null, evidencia: 'Ensayo integrado sintético.' },
      },
    });
    expect(response.status()).toBe(201);
    const participation = await response.json();
    await page.goto(`/bagua-master?predio=${p.id}`);
    await page.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Registrar entrega en el predio' }),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Participación', exact: true })).toHaveValue(
      participation.id,
    );
    const material = `Material de prueba ${info.project.name}`;
    await page.getByLabel('Material entregado', { exact: true }).fill(material);
    await page.getByRole('button', { name: 'Guardar entrega', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Entrega guardada');
    await page.getByRole('tab', { name: 'Actividad', exact: true }).click();
    const inspector = page.getByRole('complementary', { name: 'Ficha contextual del predio' });
    await expect(inspector).toContainText(material);
    await expect(inspector).toContainText('Cantidad sin información');
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('cerrar, cancelar y guardar respetan los cambios de la ficha', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'tablet', 'Se comprueba en escritorio y móvil.');
    const p = await prepare(page);
    await page.goto(`/bagua-master?predio=${p.id}&trabajo=gestion`);
    await page.getByRole('button', { name: 'Editar predio', exact: true }).click();
    await page.getByLabel('Sector', { exact: true }).fill('Sector sintético editado en contexto');
    page.once('dialog', (native) => native.dismiss());
    await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    await expect(page.getByLabel('Sector', { exact: true })).toHaveValue(
      'Sector sintético editado en contexto',
    );
    await page.getByRole('button', { name: 'Guardar predio', exact: true }).click();
    await expect(dialog(page).getByRole('status')).toContainText('Predio guardado');
    await page.getByRole('button', { name: 'Editar predio', exact: true }).click();
    await page.getByLabel('Sector', { exact: true }).fill('Este cambio se descarta');
    page.once('dialog', (native) => native.accept());
    await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    const body = await (await page.request.get(`/api/gestion/predios/${p.id}`)).json();
    expect(body.predio.sector).toBe('Sector sintético editado en contexto');
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('herramientas según perfil, entrada global de actividad y búsqueda de rutas', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'tablet', 'Se comprueba en escritorio y móvil.');
    await prepare(page);
    await page.goto('/bagua-master');
    await page.getByRole('button', { name: 'Abrir herramientas' }).click();
    await page.getByRole('menuitem', { name: 'Registrar actividad', exact: true }).click();
    await expect(
      dialog(page).getByRole('heading', { name: 'Selecciona el predio de la actividad' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    await page.getByRole('searchbox').fill('1001');
    const routes = page.getByRole('region', { name: 'Rutas documentales DWG' });
    await routes.getByRole('button', { name: /1001/ }).first().click();
    await expect(page.locator('.bm-rutas')).toContainText('1001');
    await page.request.post('/api/gestion/sesion', { headers, data: reader });
    await page.reload();
    await page.getByRole('button', { name: 'Abrir herramientas' }).click();
    await expect(page.getByRole('menuitem', { name: 'Reportes', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Registrar actividad' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Importaciones' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Reportes', exact: true }).click();
    await expect(dialog(page).getByRole('button', { name: 'Consultar reporte' })).toBeVisible();
    await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  });
});
