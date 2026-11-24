import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { requireFixtureTarget } from './helpers/fixture-target';

// Operación del servicio con la simulación realista (scripts/bagua-master/simular_operacion.py):
// horario en cualquier punto del mapa, programación de rutas, expediente con participación,
// recorrido de campo (registrar y corregir una visita), resultados y padrón en formato MINAM.
test.use({ trace: 'off', screenshot: 'off', actionTimeout: 15000 });

const PLAZA = { lon: -78.5316, lat: -5.6389 };

function credentials() {
  const file = 'artifacts/accesos-locales/registro-bagua.txt';
  if (!existsSync(file)) return null;
  const source = readFileSync(file, 'utf8');
  return {
    usuario: source.match(/^Usuario: (.+)$/m)![1]!,
    password: source.match(/^Contraseña: (.+)$/m)![1]!,
  };
}

async function signIn(page: Page) {
  const account = credentials();
  await page.goto('/bagua-master/expedientes');
  const form = await page
    .getByLabel('Contraseña', { exact: true })
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  if (form && account) {
    await page.getByLabel('Usuario', { exact: true }).fill(account.usuario);
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: /^Cuenta de / })).toBeVisible();
}

test.describe('Operación del servicio de residuos', () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      browserName !== 'chromium' || info.project.name !== 'desktop',
      'Recorrido de escritorio (el campo móvil se prueba con su propio viewport).',
    );
  });

  test('la consulta por punto dice qué servicio pasa y a qué hora', async ({ request }) => {
    const res = await request.get(
      `/api/bagua-master/servicio/consulta?lon=${PLAZA.lon}&lat=${PLAZA.lat}`,
    );
    expect(res.ok()).toBe(true);
    const { servicios } = await res.json();
    expect(servicios.length).toBeGreaterThan(0);
    for (const s of servicios) {
      expect(['convencional', 'organicos', 'reciclables', 'comercial']).toContain(s.servicio);
      expect(s.horaEstimada).toMatch(/^\d{2}:\d{2}$/);
      expect(s.horaEstimada >= s.horaInicio && s.horaEstimada <= s.horaFin).toBe(true);
    }
    const programs = await (await request.get('/api/bagua-master/servicio/programacion')).json();
    expect(programs.programaciones.map((p: { servicio: string }) => p.servicio)).toEqual(
      expect.arrayContaining(['convencional', 'organicos', 'reciclables', 'comercial']),
    );
  });

  test('la ficha del mapa y la ruta muestran el horario', async ({ page }) => {
    await page.goto(
      '/bagua-master?lugar=lugar:00ccb95d-4ad6-4484-8db0-8191838d43a1&x=-78.5330&y=-5.6372',
    );
    const map = page.getByTestId('bagua-master-map');
    await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
    await expect(page.getByTestId('bm-info')).toContainText('Recolección aquí');
    await expect(page.getByTestId('bm-horario').first()).toContainText(/pasa aprox\. \d{2}:\d{2}/);
    await page.goto('/bagua-master?explorar=rutas');
    await page.getByTestId('bm-ruta-MUN-1001').click();
    await expect(page.getByTestId('bm-ruta-programas')).toContainText('Convencional');
    await expect(page.getByTestId('bm-ruta-programas')).toContainText('Reciclables');
  });

  test('el expediente muestra horario y participación con historial de visitas', async ({
    page,
  }) => {
    await signIn(page);
    const list = await (await page.request.get('/api/gestion/predios?q=BG-00500')).json();
    const predio = list.items.find((p: { codigo: string }) => p.codigo === 'BG-00500');
    test.skip(!predio, 'Requiere la simulación cargada (simular_operacion.py).');
    await page.goto(`/bagua-master/expedientes/predio/${predio.id}`);
    const section = page.getByTestId('pr-operacion');
    await expect(section).toContainText('Horario de recolección en este predio');
    await expect(section.getByTestId('bm-horario')).toContainText('Convencional');
    await expect(section.getByTestId('pr-participacion').first()).toContainText(
      'de visitas con entrega',
    );
  });

  test('en campo se registra una visita y se puede corregir', async ({ page, request }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    await page.goto('/bagua-master/campo');
    await page.getByRole('button', { name: 'Reciclables', exact: true }).click();
    await page.getByLabel('Fecha del recorrido').fill('2026-11-21');
    const list = page.getByTestId('cp-lista');
    await expect(list).toBeVisible();
    const pending = list
      .locator('li', { has: page.getByRole('button', { name: 'Ausente', exact: true }) })
      .first();
    const address = (await pending.locator('.cp-datos strong').textContent())!;
    const row = list.locator('li', { hasText: address }).first();
    await row.getByRole('button', { name: 'Entregó', exact: true }).click();
    await row.getByRole('button', { name: 'Plástico PET', exact: true }).click();
    await row.getByLabel('Kilos de Plástico PET').fill('1,4');
    await row.getByRole('button', { name: 'Guardar entrega' }).click();
    await expect(row).toContainText('Entregó · Plástico PET 1.4 kg');
    await row.getByRole('button', { name: 'Corregir' }).click();
    await expect(row.getByRole('button', { name: 'Ausente', exact: true })).toBeVisible();
  });

  test('resultados abre las visitas de una cifra y exporta el padrón oficial', async ({ page }) => {
    await signIn(page);
    await page.goto('/bagua-master/resultados');
    const results = page.getByTestId('resultados-operacion');
    await expect(results).toContainText('Recolección selectiva de orgánicos');
    await results
      .getByRole('button', { name: /de las visitas con entrega/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('li').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    const csv = await (
      await page.request.get('/api/gestion/padron.csv?servicio=reciclables&tipo=domiciliario')
    ).text();
    expect(csv).toContain('Anexo N.° 03-A');
    expect(csv).toContain('Nombre y apellido del representante;N.° habitantes;Zona / sector');
    expect(csv.split('\r\n').length).toBeGreaterThan(50);
  });
});
