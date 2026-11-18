import { requireFixtureTarget } from './helpers/fixture-target';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function credentials(name: string) {
  const file = path.resolve('artifacts/accesos-locales', `${name}.txt`);
  if (!existsSync(file)) return null;
  const content = readFileSync(file, 'utf8');
  return {
    usuario: content.match(/^Usuario: (.+)$/m)![1],
    password: content.match(/^Contraseña: (.+)$/m)![1],
  };
}
const registrar = credentials('registro-bagua');
const reader = credentials('consulta-bagua');
const headers = { 'X-Bagua-Request': '1' };
async function record(page: Page, status: string) {
  const code = `E2E-MAPA-${randomUUID().slice(0, 8)}`;
  const response = await page.request.post('/api/gestion/predios', {
    headers,
    data: {
      codigo: code,
      direccion: 'Dirección ficticia para probar el mapa de trabajo',
      sector: 'Sector sintético de ensayo',
      uso: 'Uso de prueba',
      estadoUbicacion: status,
      ...(status === 'pendiente' || status === 'conflictiva'
        ? {}
        : {
            ubicacion: { type: 'Point', coordinates: [-78.5367, -5.6378] },
            estadoUbicacion: status,
            evidenciaUbicacion: 'Ejemplo sintético; no valida un predio municipal.',
          }),
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; codigo: string };
}
const inspector = (page: Page) =>
  page.getByRole('complementary', { name: 'Ficha contextual del predio' });
const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Buscar predio, calle, lugar o ruta en Bagua' });
async function ready(page: Page) {
  await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-ready', 'true', {
    timeout: 60000,
  });
}
test.describe('Mapa de trabajo con padrón protegido', () => {
  test.skip(
    !registrar || !reader,
    'Requiere los accesos de prueba preparados con gestion:usuario.',
  );
  test.beforeEach(async ({ request }) => {
    await requireFixtureTarget(request, registrar);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('buscar, consultar, abrir ficha completa y volver sin perder la selección', async ({
    page,
  }, info) => {
    expect(
      (await page.request.post('/api/gestion/sesion', { headers, data: registrar })).ok(),
    ).toBe(true);
    const item = await record(page, 'verificada');
    await page.goto('/bagua-master');
    await ready(page);
    await page.screenshot({
      path: `artifacts/screenshots/map-workspace-after-${info.project.name}.png`,
    });
    await search(page).fill(item.codigo);
    await expect(page.getByRole('button', { name: new RegExp(item.codigo) })).toBeVisible();
    await search(page).press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(inspector(page)).toContainText(item.codigo);
    await expect(page.locator('.bm-predio-marker')).toBeVisible();
    await expect(inspector(page)).toContainText('Datos sintéticos');
    await expect(inspector(page)).toContainText('Verificada en el registro sintético');
    await page.getByRole('tab', { name: 'General', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Servicios', exact: true })).toBeFocused();
    await expect(inspector(page)).toContainText('Sin asignaciones registradas');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Servicios', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'General', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-idle', 'true', {
      timeout: 60000,
    });
    await expect(page.locator('.bm-predio-marker')).toBeVisible();
    await page.screenshot({ path: `artifacts/screenshots/map-inspector-${info.project.name}.png` });
    const panelBox = (await inspector(page).boundingBox())!;
    const mapBox = (await page.getByTestId('bagua-master-map').boundingBox())!;
    if (info.project.name === 'mobile') {
      expect(panelBox.height).toBeLessThan(page.viewportSize()!.height * 0.53);
      await expect
        .poll(async () => {
          const markerBox = (await page.locator('.bm-predio-marker').boundingBox())!;
          return markerBox.y + markerBox.height;
        })
        .toBeLessThan(panelBox.y);
    } else expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(panelBox.x + 1);
    await page.getByRole('link', { name: 'Abrir ficha administrativa' }).click();
    await expect(page.getByRole('article')).toContainText(item.codigo);
    await page.getByRole('button', { name: 'Volver al mapa' }).click();
    await expect(inspector(page)).toContainText(item.codigo);
    await expect(search(page)).toHaveValue(item.codigo);
    await page.getByRole('button', { name: 'Cerrar ficha del predio' }).click();
    await expect(inspector(page)).toHaveCount(0);
    await expect(search(page)).toBeFocused();
    await search(page).press('Escape');
    await expect(page.locator('.bm-work-results')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('ubicación pendiente, aproximada y conflictiva no generan un punto confirmado', async ({
    page,
  }) => {
    await page.request.post('/api/gestion/sesion', { headers, data: registrar });
    const pending = await record(page, 'pendiente');
    const approximate = await record(page, 'aproximada');
    const conflict = await record(page, 'conflictiva');
    await page.goto(`/bagua-master?predio=${pending.id}`);
    await expect(inspector(page)).toContainText('Pendiente; no se coloca un punto');
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
    await page.goto(`/bagua-master?predio=${approximate.id}`);
    await ready(page);
    await expect(inspector(page)).toContainText('Aproximada; pendiente de verificación');
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mostrar referencia aproximada' }).click();
    await expect(page.locator('.bm-predio-marker.is-approximate')).toBeVisible();
    await page.reload();
    await expect(inspector(page)).toContainText(approximate.codigo);
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
    await page.goto(`/bagua-master?predio=${conflict.id}`);
    await expect(inspector(page)).toContainText('Conflictiva; requiere revisión');
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('ingreso desde búsqueda conserva contexto y consulta respeta permisos', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'tablet', 'Verificado en escritorio y móvil.');
    await page.request.post('/api/gestion/sesion', { headers, data: registrar });
    const item = await record(page, 'pendiente');
    await page.request.post('/api/gestion/salir', { headers, data: {} });
    await page.goto('/bagua-master');
    await search(page).fill(item.codigo);
    await expect(page.getByRole('button', { name: new RegExp(item.codigo) })).toHaveCount(0);
    await page.getByRole('link', { name: 'Ingresar para buscar predios' }).click();
    await page.getByLabel('Usuario', { exact: true }).fill(reader!.usuario!);
    await page.getByLabel('Contraseña', { exact: true }).fill(reader!.password!);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(search(page)).toHaveValue(item.codigo);
    await search(page).focus();
    await page.getByRole('button', { name: new RegExp(item.codigo) }).click();
    await expect(inspector(page)).toContainText(item.codigo);
    const response = await page.request.get(`/api/gestion/predios/${item.id}`);
    const body = await response.json();
    expect(body.personas).toEqual([]);
    expect(body.historial).toEqual([]);
    expect(body.personasPermitidas).toBe(false);
    await page.getByRole('link', { name: 'Abrir ficha administrativa' }).click();
    await expect(page.getByRole('button', { name: 'Editar predio' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Personas', exact: true }).click();
    await expect(page.getByRole('article')).toContainText('Tu perfil no tiene acceso');
    await page.request.post('/api/gestion/salir', { headers, data: {} });
    await page.goto(`/bagua-master?predio=${item.id}`);
    await expect(inspector(page)).toContainText('Ingresa para consultar');
    await expect(inspector(page)).not.toContainText(item.codigo);
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('errores de búsqueda se pueden reintentar y se distinguen de cero coincidencias', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'Misma consulta en los tres tamaños.');
    await page.request.post('/api/gestion/sesion', { headers, data: reader });
    await page.route('**/api/gestion/predios?*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":{"message":"Ensayo de error"}}',
      }),
    );
    await page.goto('/bagua-master');
    await search(page).fill('NO-EXISTE-E2E-XYZ');
    await expect(page.getByRole('alert')).toContainText('No se pudo consultar el padrón');
    await expect(page.getByText('Sin predios coincidentes.', { exact: false })).toHaveCount(0);
    await page.unroute('**/api/gestion/predios?*');
    await page.getByRole('button', { name: 'Reintentar búsqueda de predios' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Sin predios coincidentes' }),
    ).toBeVisible();
    await search(page).fill('plaza de armas');
    await page.getByRole('button', { name: /Plaza de Armas Bagua/ }).click();
    await expect(page.getByTestId('bm-info')).toContainText('Plaza de Armas Bagua');
    await expect(inspector(page)).toHaveCount(0);
  });
});
