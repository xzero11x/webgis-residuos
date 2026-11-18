import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';

// El acceso se prueba por UI. Nunca guardar trazas ni capturas de campos secretos.
test.use({ trace: 'off', screenshot: 'off', actionTimeout: 15000 });
function credentials(name = 'admin-bagua') {
  const source = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return {
    usuario: source.match(/^Usuario: (.+)$/m)![1],
    password: source.match(/^Contraseña: (.+)$/m)![1],
  };
}
const map = (page: Page) => page.getByTestId('bagua-master-map');
const workspace = (page: Page) => page.getByRole('dialog', { name: 'Espacio de trabajo' });
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('consulta descubre registros sin acciones administrativas ni identidades', async ({
  page,
  request,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Permisos independientes del tamaño; A–F cubre las tres pantallas.',
  );
  await requireFixtureTarget(request, credentials());
  await page.goto('/bagua-master');
  await page.getByRole('link', { name: 'Ingresar', exact: true }).click();
  const account = credentials('consulta-bagua');
  await page.getByLabel('Usuario', { exact: true }).fill(account.usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await workspace(page).getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(workspace(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Registros', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrar entrega', exact: true })).toHaveCount(0);
  await searchPredio(page, 'SYN-BAGUA-MULTI');
  const inspector = page.getByRole('complementary', { name: 'Ficha contextual del predio' });
  await inspector.getByRole('tab', { name: 'Personas', exact: true }).click();
  await expect(inspector).toContainText('Tu perfil no consulta identidades personales.');
  await page.getByRole('button', { name: 'Abrir herramientas' }).click();
  for (const name of [
    'Importaciones',
    'Catálogos de prueba',
    'Cuentas de prueba',
    'Auditoría de operaciones',
  ])
    await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/gestion/auditoria')).status()).toBe(403);
  expect((await page.request.get('/api/gestion/personas?q=SYN-BAGUA')).status()).toBe(403);
  expect(
    (
      await page.request.post('/api/gestion/usuarios', {
        headers: { 'X-Bagua-Request': '1' },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
async function searchPredio(page: Page, code: string) {
  await page
    .getByRole('searchbox', { name: 'Buscar predio, calle, lugar o ruta en Bagua' })
    .fill(code);
  await page
    .getByRole('region', { name: 'Predios administrativos' })
    .getByRole('button', { name: new RegExp(code) })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'Ficha contextual del predio' }),
  ).toContainText(code);
}
async function tools(page: Page, name: string) {
  await page.getByRole('button', { name: 'Abrir herramientas' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('A–F producto accesible desde inicio, operaciones persistentes y evidencia visual real', async ({
  page,
  request,
}, info) => {
  test.setTimeout(210000);
  await requireFixtureTarget(request, credentials());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('dialog', (dialog) => {
    errors.push(`Diálogo inesperado: ${dialog.type()}`);
    void dialog.dismiss();
  });
  const capture = async (name: string) => {
    await expect(map(page)).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    await page.screenshot({
      path: `artifacts/screenshots/producto-${info.project.name}-${name}.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  };
  await page.goto('/bagua-master');
  await expect(map(page)).toHaveAttribute('data-idle', 'true', { timeout: 60000 });
  await capture('01-inicio');
  await page.getByRole('link', { name: 'Ingresar', exact: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill(credentials().usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials().password);
  await workspace(page).getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(workspace(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Registros', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Registros', exact: true }).click();
  await page.getByLabel('Buscar predio', { exact: true }).fill('SYN-BAGUA-MULTI');
  await expect(page.getByText('SYN-BAGUA-MULTI', { exact: true }).first()).toBeVisible();
  await workspace(page).getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  // A: búsqueda visible, selección y ficha ampliable en la misma instancia de mapa.
  await page
    .getByRole('searchbox', { name: 'Buscar predio, calle, lugar o ruta en Bagua' })
    .fill('SYN-BAGUA-MULTI');
  await expect(page.getByRole('region', { name: 'Predios administrativos' })).toContainText(
    'SYN-BAGUA-MULTI',
  );
  await capture('02-busqueda');
  await page
    .getByRole('region', { name: 'Predios administrativos' })
    .getByRole('button', { name: /SYN-BAGUA-MULTI/ })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'Ficha contextual del predio' }),
  ).toContainText('SYN-BAGUA-MULTI');
  const inspector = page.getByRole('complementary', { name: 'Ficha contextual del predio' });
  await inspector.getByRole('tab', { name: 'Personas', exact: true }).click();
  await expect(inspector).toContainText('Persona ficticia Alba');
  await inspector.getByRole('tab', { name: 'Unidades', exact: true }).click();
  await expect(inspector).toContainText('U-01');
  await capture('03-ficha');
  await inspector.getByRole('tab', { name: 'General', exact: true }).click();
  await map(page).evaluate((element) => {
    element.dataset.journeyInstance = 'preserved';
  });
  await page.getByRole('link', { name: 'Abrir ficha administrativa' }).click();
  const detail = workspace(page).getByRole('article', { name: 'Ficha administrativa del predio' });
  await detail.getByRole('tab', { name: 'Personas', exact: true }).click();
  await expect(detail).toContainText('Persona ficticia Alba');
  await detail.getByRole('tab', { name: 'Unidades', exact: true }).click();
  await expect(detail).toContainText('U-01');
  await detail.getByText('Personas y servicios de esta unidad', { exact: true }).first().click();
  await expect(detail).toContainText('Persona ficticia Alba');
  await capture('04-relaciones-unidades');
  await detail.getByRole('button', { name: 'Editar predio', exact: true }).click();
  const note =
    'Observación sintética verificada en UI ' + info.project.name + ' ' + randomUUID().slice(0, 8);
  await workspace(page)
    .getByRole('textbox', { name: /^Observaciones/ })
    .fill(note);
  await workspace(page).getByRole('button', { name: 'Guardar predio', exact: true }).click();
  await detail.getByRole('tab', { name: 'Resumen', exact: true }).click();
  await expect(detail).toContainText(note);
  await page.reload();
  await expect(detail).toContainText(note);
  // B: asignación, participación y nueva entrega son estados separados.
  await detail.getByRole('tab', { name: 'Servicios', exact: true }).click();
  await expect(detail).toContainText('Orgánicos');
  await detail.getByRole('tab', { name: 'Entregas', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
  await page.getByRole('combobox', { name: /^Participación/ }).selectOption({ index: 1 });
  const material =
    'Material sintético recorrido ' + info.project.name + ' ' + randomUUID().slice(0, 6);
  await page.getByLabel('Material registrado', { exact: true }).fill(material);
  await page.getByLabel('Cantidad (si se midió)', { exact: true }).fill('2.5');
  await page.getByRole('combobox', { name: /^Unidad/ }).selectOption('kg');
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(detail).toContainText(material);
  await capture('05-servicios-entrega');
  await detail.getByRole('tab', { name: 'Historial', exact: true }).click();
  await expect(detail).toContainText('Entrega registrada');
  await workspace(page).getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  // C: persona → unidad → predio, mediante enlaces visibles.
  await page
    .getByRole('searchbox', { name: 'Buscar predio, calle, lugar o ruta en Bagua' })
    .fill('SYN-BAGUA-PER-ALBA');
  await page
    .getByRole('region', { name: 'Personas autorizadas' })
    .getByRole('button', { name: /Persona ficticia Alba/ })
    .click();
  const person = page.getByRole('complementary', { name: 'Persona y vínculos autorizados' });
  await expect(person).toContainText('SYN-BAGUA-MULTI');
  await person
    .getByRole('link', { name: /Consultar unidad U-01 del predio SYN-BAGUA-MULTI/ })
    .click();
  const unitInspector = page.getByRole('complementary', { name: 'Ficha contextual de la unidad' });
  await expect(unitInspector).toContainText('U-01');
  await unitInspector.getByRole('button', { name: 'Volver al predio', exact: true }).click();
  // D: candidatos originales y decisión humana explícita; solo escritorio cambia estado.
  await searchPredio(page, 'SYN-BAGUA-REVISION');
  await page.getByRole('link', { name: 'Revisar vínculos espaciales' }).click();
  const spatial = page.getByRole('complementary', { name: 'Revisión espacial del predio' });
  await spatial
    .getByRole('button', { name: /Ver geometría/ })
    .first()
    .click();
  await expect(map(page)).toHaveAttribute('data-idle', 'true', { timeout: 60000 });
  if (info.project.name === 'desktop') {
    const form = spatial
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Guardar decisión espacial' }) })
      .first();
    const decision = form.locator('select');
    const canReject = await decision.locator('option[value="rechazado"]').count();
    await decision.selectOption(canReject ? 'rechazado' : 'revision');
    await form
      .getByLabel('Motivo de revisión')
      .fill('Ensayo humano sintético: evidencia insuficiente para confirmar identidad.');
    await form.getByRole('button', { name: 'Guardar decisión espacial' }).click();
    await expect(spatial.getByRole('status')).toContainText('Revisión guardada');
  }
  await capture('06-revision-espacial');
  await spatial.getByRole('button', { name: 'Volver a ficha' }).click();
  // E: reporte consulta el evento persistido, no un array de demostración.
  await tools(page, 'Reportes');
  await page.getByLabel('Material del reporte').fill(material);
  await page.getByRole('button', { name: 'Consultar reporte' }).click();
  await expect(page.getByRole('table')).toContainText(material);
  await expect(page.getByRole('table')).toContainText('2.5');
  await capture('07-reportes');
  await workspace(page).getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  // F: administración descubrible y mapa montado al abrir herramientas autorizadas.
  await page.getByRole('button', { name: 'Abrir herramientas' }).click();
  for (const name of [
    'Importaciones',
    'Catálogos de prueba',
    'Cuentas de prueba',
    'Auditoría de operaciones',
  ])
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  await capture('08-herramientas');
  await page.keyboard.press('Escape');
  await tools(page, 'Auditoría de operaciones');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(map(page)).toBeAttached();
  expect(errors).toEqual([]);
});
