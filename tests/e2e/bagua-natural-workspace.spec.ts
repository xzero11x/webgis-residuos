import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';
test.use({ trace: 'off', screenshot: 'off' });
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('experiencia continua: predio, unidad, persona, entrega, servicio y mapa', async ({
  page,
  request,
}, info) => {
  test.setTimeout(150000);
  const access = readFileSync('artifacts/accesos-locales/admin-bagua.txt', 'utf8');
  const credentials = {
    usuario: access.match(/^Usuario: (.+)$/m)![1],
    password: access.match(/^Contraseña: (.+)$/m)![1],
  };
  await requireFixtureTarget(request, credentials);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/bagua-master');
  await page.getByRole('link', { name: 'Ingresar', exact: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill(credentials.usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
  await page
    .getByRole('navigation', { name: 'Vistas del territorio' })
    .getByRole('button', { name: 'Predios', exact: true })
    .click();
  const exploration = page.getByRole('complementary', { name: 'Explorar predios' });
  await exploration
    .getByLabel('Sector del registro')
    .selectOption('Comercio · sector de demostración');
  await exploration.getByRole('link', { name: /Analizar registros de este sector/ }).click();
  await expect(page.getByRole('textbox', { name: /Sector del reporte/ })).toHaveValue(
    'Comercio · sector de demostración',
  );
  await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  await exploration.getByRole('link', { name: /Jr. Comercio 216/ }).click();
  const inspector = page.getByRole('complementary', { name: 'Ficha contextual del predio' });
  await expect(inspector.getByRole('button', { name: '2 Unidades', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: '2 Unidades', exact: true }).click();
  await inspector.getByRole('link', { name: /U-01/ }).click();
  const unit = page.getByRole('complementary', { name: 'Ficha contextual de la unidad' });
  await expect(unit).toContainText('Vivienda familiar');
  await unit.getByRole('link', { name: /Alba Ríos/ }).click();
  const person = page.getByRole('complementary', { name: 'Persona y vínculos autorizados' });
  await person.getByRole('button', { name: /Volver al predio de origen/ }).click();
  // Las relaciones se recorren en la muestra; las escrituras usan su propio fixture E2E.
  const originalId = new URL(page.url()).searchParams.get('predio')!;
  const headers = { 'X-Bagua-Request': '1' };
  const original = await (await page.request.get(`/api/gestion/predios/${originalId}`)).json();
  for (const event of original.entregas.filter(
    (e: { material: string; anulada: boolean }) =>
      !e.anulada && e.material.startsWith('Restos de verduras · ensayo de recorrido '),
  )) {
    expect(
      (
        await page.request.post(`/api/gestion/entregas/${event.id}/anular`, {
          headers,
          data: {
            motivo: 'Ensayo E2E propio finalizado; evento conservado en historial.',
            version: event.version,
          },
        })
      ).ok(),
    ).toBe(true);
  }
  const fixtureCode = 'E2E-NATURAL-' + randomUUID().slice(0, 8);
  const created = await page.request.post('/api/gestion/predios', {
    headers,
    data: {
      codigo: fixtureCode,
      direccion: 'Bodega de ensayo aislado',
      sector: 'Sector E2E',
      uso: 'Comercial',
      observaciones: 'Fixture de la prueba de recorrido; separado de la muestra curada.',
    },
  });
  expect(created.ok()).toBe(true);
  const fixture = await created.json();
  const servicioId = original.participaciones[0].servicio_id;
  const periodo = {
    desde: '2026-01-01',
    hasta: null,
    evidencia: 'Participación sintética para prueba de recorrido aislada.',
  };
  expect(
    (
      await page.request.post(`/api/gestion/predios/${fixture.id}/participaciones`, {
        headers,
        data: { servicioId, periodo },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/gestion/predios/${fixture.id}/asignaciones`, {
        headers,
        data: { servicioId, estado: 'pendiente', periodo },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByRole('searchbox', { name: 'Buscar predio, calle, lugar o ruta en Bagua' })
    .fill(fixtureCode);
  await page
    .getByRole('region', { name: 'Predios administrativos' })
    .getByRole('button', { name: new RegExp(fixtureCode, 'i') })
    .click();
  await inspector.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
  const composer = page.getByRole('region', { name: 'Registrar entrega en el predio' });
  const material = 'Restos de verduras · ensayo de recorrido ' + randomUUID().slice(0, 8);
  await composer.getByLabel('Material entregado', { exact: true }).fill(material);
  page.once('dialog', (dialog) => void dialog.dismiss());
  await inspector.getByRole('button', { name: 'Cerrar ficha del predio' }).click();
  await expect(composer.getByLabel('Material entregado', { exact: true })).toHaveValue(material);
  // Una cantidad sin medición permanece nula al guardar y recargar.
  await composer.getByRole('button', { name: 'Guardar entrega', exact: true }).click();
  await expect(inspector.getByRole('status')).toContainText('Entrega guardada');
  await expect(inspector).toContainText(material);
  await page.reload();
  await expect(inspector).toContainText(material);
  await expect(inspector).toContainText('Cantidad sin información');
  await inspector.getByRole('tab', { name: 'Servicios', exact: true }).click();
  await inspector
    .getByRole('link', { name: /Consultar actividad de este servicio/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Espacio de trabajo' })).toBeVisible();
  await expect(map).toBeAttached();
  await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  await page.goto(`/bagua-master?predio=${originalId}`);
  await inspector.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(map).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: `artifacts/screenshots/natural-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
