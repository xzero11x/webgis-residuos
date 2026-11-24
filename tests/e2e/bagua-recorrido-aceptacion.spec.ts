import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requireFixtureTarget } from './helpers/fixture-target';

// Recorrido de aceptación del producto: documento ficticio → persona → predio elegido →
// mapa → expediente → registrar una entrega → comprobar que persiste. Solo corre contra un
// objetivo local de ensayo (requireFixtureTarget) y nunca guarda trazas con credenciales.
test.use({ trace: 'off', screenshot: 'off', actionTimeout: 15000 });

function credentials(name = 'admin-bagua') {
  const source = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return {
    usuario: source.match(/^Usuario: (.+)$/m)![1],
    password: source.match(/^Contraseña: (.+)$/m)![1],
  };
}

async function signIn(page: Page, name: string) {
  const account = credentials(name);
  await page.goto('/bagua-master/expedientes');
  // Con BAGUA_ACCESO_LIBRE=true no hay formulario de ingreso.
  if (
    await page
      .getByLabel('Contraseña', { exact: true })
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(
        () => true,
        () => false,
      )
  ) {
    await page.getByLabel('Usuario', { exact: true }).fill(account.usuario);
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: /^Cuenta de / })).toBeVisible();
}

const search = (page: Page) =>
  page.getByRole('combobox', { name: 'Buscar predio, persona, unidad, ruta, calle o lugar' });

test('del documento a la entrega registrada, con datos persistentes', async ({
  page,
  request,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'El recorrido completo se valida en escritorio; móvil se revisa en capturas.',
  );
  await requireFixtureTarget(request, credentials());
  await signIn(page, 'admin-bagua');

  // 1–2. Un documento ficticio encuentra a una persona, sin saltar nunca a un predio.
  await page.goto('/bagua-master');
  await search(page).fill('90000001');
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/persona=/);
  const person = page.getByRole('complementary', { name: 'Persona y vínculos autorizados' });
  await expect(person).toContainText('Persona ficticia');
  await expect(person.getByRole('button', { name: /^Consultar predio / }).first()).toBeVisible();
  expect(page.url()).not.toContain('predio=');

  // 3. La persona elige cuál de sus predios consultar en el mapa.
  await person.getByRole('button', { name: 'Consultar predio SYN-BAGUA-VIDA-VIVIENDA' }).click();
  await expect(page).toHaveURL(/predio=/);
  const inspector = page.getByRole('complementary', { name: 'Ficha contextual del predio' });
  await expect(inspector).toContainText('SYN-BAGUA-VIDA-VIVIENDA');

  // 4. El expediente completo muestra su ubicación por vínculo espacial sintético confirmado.
  await inspector.getByRole('link', { name: 'Abrir expediente completo' }).click();
  await expect(page).toHaveURL(/expedientes\/predio\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('SYN-BAGUA-VIDA-VIVIENDA');
  await expect(page.getByText('Vínculo espacial confirmado · sintético')).toBeVisible();

  // 5. Registrar una entrega nueva desde el expediente.
  const material = `Cartón limpio · prueba ${randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Registrar entrega' }).first().click();
  await page.getByLabel('Material entregado').fill(material);
  await page.getByRole('button', { name: 'Guardar entrega' }).click();
  await expect(page.getByText(material).first()).toBeVisible();

  // 6. Recargar: el registro persiste en la actividad del expediente.
  await page.reload();
  await expect(page.getByText(material).first()).toBeVisible();
});

test('una edificación sin relación predial no inventa predios', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'Interacción de mapa en escritorio.');
  await requireFixtureTarget(request, credentials());
  await signIn(page, 'admin-bagua');
  const res = await page.request.get('/api/gestion/predios?q=SYN-BAGUA-VIDA-REVISION');
  const id = (await res.json()).items[0].id as string;
  // REVISION solo tiene vínculos propuestos: el expediente debe decir que no hay ubicación
  // confirmada en lugar de estimarla por cercanía.
  await page.goto(`/bagua-master/expedientes/predio/${id}`);
  await expect(page.getByText('Ubicación pendiente').first()).toBeVisible();
  await expect(page.getByText('Vínculo espacial confirmado · sintético')).toHaveCount(0);
});
