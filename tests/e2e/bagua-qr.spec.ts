import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { requireFixtureTarget } from './helpers/fixture-target';

// Stickers QR del predio: el vecino escanea y ve el horario; el promotor escanea y registra la
// visita en un toque; el expediente reemplaza un sticker perdido; la hoja de stickers se imprime.
test.use({ trace: 'off', screenshot: 'off', actionTimeout: 15000 });

// Día de demostración: el último martes o viernes (días de orgánicos) hasta el «hoy» de la
// simulación, que deja ese recorrido en curso con participantes por visitar.
const DAY = (() => {
  const file = 'data/bagua-master/simulacion/resumen.json';
  const hoy = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { hoy?: string }).hoy
    : undefined;
  const d = new Date(`${hoy ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  while (![2, 5].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

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

interface Label {
  codigo: string;
  predioId: string;
  direccion: string;
}

async function labels(request: APIRequestContext, servicio: string): Promise<Label[]> {
  const res = await request.get(`/api/gestion/qr/etiquetas?servicio=${servicio}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).etiquetas;
}

/** Un sticker cuyo predio tiene una visita del día aún sin registrar. */
async function pendingSticker(request: APIRequestContext) {
  for (const label of (await labels(request, 'organicos')).slice(0, 80)) {
    const scan = await (await request.get(`/api/gestion/qr/${label.codigo}?fecha=${DAY}`)).json();
    if (
      scan.participaciones?.some(
        (p: { programadoHoy: boolean; resultado: string | null }) =>
          p.programadoHoy && !p.resultado,
      )
    )
      return label;
  }
  throw new Error('La simulación no dejó visitas pendientes el día de demostración.');
}

test.describe('Stickers QR del predio', () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      browserName !== 'chromium' || info.project.name === 'tablet',
      'Un recorrido por formato.',
    );
  });

  test('el vecino escanea el sticker y ve cuándo pasa el camión', async ({ page }) => {
    await signIn(page);
    const [label] = await labels(page.request, 'organicos');
    const publico = await page.request.get(`/api/bagua-master/qr/${label!.codigo}`);
    expect(publico.ok()).toBe(true);
    const body = await publico.json();
    expect(body.activo).toBe(true);
    expect(body.servicios.length).toBeGreaterThan(0);
    // Nada personal en la respuesta pública.
    expect(JSON.stringify(body)).not.toMatch(/dni|telefono|titular|direccion/i);
    expect((await page.request.get('/api/bagua-master/qr/JH1083G4')).status()).toBe(400);

    await page.goto(`/bagua-master/q/${label!.codigo.toLowerCase()}`);
    const card = page.getByTestId('qr-landing');
    await expect(card.getByRole('heading', { name: '¿Cuándo pasa el camión?' })).toBeVisible();
    await expect(card).toContainText(/\d{2}:\d{2}/);
    await expect(page.getByTestId('qr-registrar')).toBeVisible();
    await page.goto('/bagua-master/q/ABCD-EFGH');
    await expect(page.getByTestId('qr-landing')).toContainText('no es válido');
  });

  test('el promotor escanea y registra la visita en un toque', async ({ page, request }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    const label = await pendingSticker(page.request);
    await page.goto(`/bagua-master/campo?qr=${label.codigo}&via=qr`);
    await page.getByLabel('Fecha del recorrido').fill(DAY);
    const visit = page.getByTestId('qr-visita');
    await expect(visit).toContainText(label.direccion);
    const today = visit
      .locator('li.is-hoy')
      .filter({ has: page.getByRole('button', { name: 'Ausente', exact: true }) })
      .first();
    await today.getByRole('button', { name: 'Ausente', exact: true }).click();
    await expect(visit.locator('li.is-hoy', { hasText: 'Ausente' }).first()).toBeVisible();
    const scan = await (
      await page.request.get(`/api/gestion/qr/${label.codigo}?fecha=${DAY}`)
    ).json();
    expect(
      scan.participaciones.some((p: { resultado: string | null }) => p.resultado === 'ausente'),
    ).toBe(true);
  });

  test('el escáner acepta el código escrito a mano', async ({ page, request }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    const [label] = await labels(page.request, 'reciclables');
    await page.goto('/bagua-master/campo');
    await page.getByTestId('cp-escanear').click();
    const manual = page.getByLabel(/escribe el código impreso/i);
    await manual.fill(`${label!.codigo.slice(0, 4).toLowerCase()}-${label!.codigo.slice(4)}`);
    await manual.press('Enter');
    await expect(page).toHaveURL(new RegExp(`qr=${label!.codigo}&via=codigo`));
    await expect(page.getByTestId('qr-visita')).toContainText(label!.direccion);
  });

  test('un sticker perdido se reemplaza y el anterior deja de abrir el predio', async ({
    page,
    request,
  }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    const all = await labels(page.request, 'reciclables');
    const label = all[all.length - 1]!;
    await page.goto(`/bagua-master/expedientes/predio/${label.predioId}`);
    const card = page.getByTestId('qr-predio');
    await expect(card.getByTestId('qr-codigo')).toHaveText(label.codigo.replace(/^(.{4})/, '$1-'));
    await card.getByRole('button', { name: 'Reemplazar' }).click();
    await card.getByLabel(/por qué se reemplaza/i).fill('Sticker dañado por la lluvia (prueba)');
    await card.getByRole('button', { name: 'Generar uno nuevo' }).click();
    await expect(card.getByTestId('qr-codigo')).not.toHaveText(
      label.codigo.replace(/^(.{4})/, '$1-'),
    );
    expect((await page.request.get(`/api/gestion/qr/${label.codigo}`)).status()).toBe(410);
    const vigente = (
      await (await page.request.get(`/api/gestion/predios/${label.predioId}/qr`)).json()
    ).vigente;
    expect(vigente.codigo).not.toBe(label.codigo);
  });

  test('la hoja de stickers genera los que faltan y queda lista para imprimir', async ({
    page,
    request,
  }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    await page.goto('/bagua-master/campo/etiquetas');
    const grid = page.getByTestId('qr-grilla');
    await expect(grid.locator('li').first()).toBeVisible();
    const batch = page.getByTestId('qr-lote');
    if (await batch.isVisible()) {
      await batch.click();
      await expect(batch).toBeHidden();
    }
    await expect(page.getByTestId('qr-imprimir')).toBeEnabled();
    await expect(grid.locator('li svg').first()).toBeVisible();
  });
});
