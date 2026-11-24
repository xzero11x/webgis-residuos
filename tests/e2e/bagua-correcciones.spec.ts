import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { requireFixtureTarget } from './helpers/fixture-target';

// Correcciones cartográficas locales y vistas 2.5D / 3D libre. Las correcciones escriben en la base
// (se anulan al terminar, quedan en el historial): solo corren contra un destino local de ensayo.
test.use({ trace: 'off', screenshot: 'off', actionTimeout: 15000 });

const PLAZA = {
  id: '00ccb95d-4ad6-4484-8db0-8191838d43a1',
  url: '/bagua-master?lugar=lugar:00ccb95d-4ad6-4484-8db0-8191838d43a1&x=-78.53159644&y=-5.63893035',
};
// Glorieta y estrado de la Plaza de Armas: Overture los publica como edificios.
const PLAZA_BUILDINGS = [
  '0ddef662-8ff4-408d-b28b-0993a58b76cd',
  'e41c92fd-cd04-4665-b615-9f87dc95e9e9',
];

function credentials() {
  const file = 'artifacts/accesos-locales/admin-bagua.txt';
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

async function openPlaza(page: Page) {
  await page.goto(PLAZA.url);
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
  await expect(page.getByTestId('bm-info')).toContainText('Plaza de Armas Bagua');
  return map;
}

const hiddenCount = async (page: Page) =>
  Number(await page.getByTestId('bagua-master-map').getAttribute('data-ocultos'));

async function undoLast(page: Page, kind: string) {
  await page.getByTestId('bm-corregir-boton').click();
  const item = page.getByTestId(`bm-correccion-${kind}`).first();
  await item.getByRole('button', { name: /^Deshacer/ }).click();
  await item.getByLabel('¿Por qué se deshace?').fill('Prueba automática');
  await item.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.getByTestId(`bm-correccion-${kind}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar correcciones' }).click();
}

test.describe('Correcciones del mapa y vistas 3D', () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      browserName !== 'chromium' || info.project.name !== 'desktop',
      'Interacción de mapa en escritorio.',
    );
  });

  test('los edificios dentro de la Plaza de Armas no se dibujan', async ({ page, request }) => {
    const corrections = await (await request.get('/api/bagua-master/correcciones')).json();
    for (const id of PLAZA_BUILDINGS) expect(corrections.ocultos.edificio).toContain(id);
    await openPlaza(page);
    expect(await hiddenCount(page)).toBeGreaterThanOrEqual(14);
  });

  test('marcar un lugar como inexistente lo oculta y se puede deshacer', async ({
    page,
    request,
  }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    await openPlaza(page);
    const before = await hiddenCount(page);
    await page.getByTestId('bm-corregir-ocultar').click();
    await page.getByLabel(/no existe\?/).fill('Prueba automática: ocultar');
    await page.getByRole('button', { name: 'Ocultar del mapa' }).click();
    await expect(page.getByTestId('bm-info')).toHaveCount(0);
    await expect.poll(() => hiddenCount(page)).toBe(before + 1);
    // La búsqueda tampoco lo devuelve mientras esté oculto.
    const found = await (
      await request.get('/api/bagua-master/buscar?q=Plaza de Armas Bagua')
    ).json();
    expect(found.some((r: { id: string }) => r.id === PLAZA.id)).toBe(false);
    await undoLast(page, 'ocultar');
    await expect.poll(() => hiddenCount(page)).toBe(before);
  });

  test('mover un lugar lo reubica y la ficha lo indica', async ({ page, request }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    const map = await openPlaza(page);
    await page.getByTestId('bm-corregir-mover').click();
    await expect(map).toHaveAttribute('data-edicion', 'mover');
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.55);
    await expect(page.getByTestId('bm-dibujo-barra')).toContainText('marcada');
    await page.getByLabel('Motivo de la corrección').fill('Prueba automática: mover');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByTestId('bm-dibujo-barra')).toHaveCount(0);
    await expect(page.getByTestId('bm-info')).toContainText('Corregida localmente');
    const corrections = await (await request.get('/api/bagua-master/correcciones')).json();
    expect(corrections.lugaresMovidos.features.map((f: { id: string }) => f.id)).toContain(
      PLAZA.id,
    );
    await page.getByRole('button', { name: 'Cerrar información' }).click();
    await undoLast(page, 'mover');
  });

  test('dibujar una edificación que falta la agrega al mapa', async ({ page, request }) => {
    await requireFixtureTarget(request, credentials());
    await signIn(page);
    const map = await openPlaza(page);
    await page.getByRole('button', { name: 'Cerrar información' }).click();
    await page.getByTestId('bm-corregir-boton').click();
    await page.getByTestId('bm-agregar-edificio').click();
    await expect(map).toHaveAttribute('data-edicion', 'agregar');
    const box = (await map.boundingBox())!;
    const [x, y] = [box.x + box.width * 0.6, box.y + box.height * 0.5];
    for (const [dx, dy] of [
      [0, 0],
      [40, 0],
      [40, 30],
      [0, 30],
    ])
      await page.mouse.click(x + dx, y + dy);
    await expect(page.getByTestId('bm-dibujo-barra')).toContainText('4 esquinas');
    await page.getByLabel('Motivo de la corrección').fill('Prueba automática: agregar');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(map).toHaveAttribute('data-agregados', '1');
    await page.getByRole('button', { name: 'Cerrar correcciones' }).click();
    await undoLast(page, 'agregar');
    await expect(map).toHaveAttribute('data-agregados', '0');
  });

  test('2.5D fija la inclinación y 3D libre la deja mover', async ({ page }) => {
    const map = await openPlaza(page);
    const pitch = async () => Number(await map.getAttribute('data-pitch'));
    await page.getByTestId('bm-modo-3d-libre').click();
    await expect(map).toHaveAttribute('data-modo', '3d');
    await expect.poll(pitch).toBeGreaterThan(60);
    const box = (await map.boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.keyboard.down('Control');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 120, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30_000 });
    expect(await pitch()).toBeLessThan(60);
    await page.getByTestId('bm-modo-3d').click();
    await expect(map).toHaveAttribute('data-modo', '2.5d');
    await expect.poll(pitch).toBe(58);
    await page.getByTestId('bm-modo-3d').click();
    await expect(map).toHaveAttribute('data-modo', '2d');
    await expect.poll(pitch).toBe(0);
  });
});
