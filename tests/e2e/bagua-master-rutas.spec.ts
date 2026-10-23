import { expect, test, type Page } from '@playwright/test';

// BAGUA MASTER, fase 2: rutas municipales de recolección sobre la cartografía de Overture.
async function openMaster(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/bagua-master');
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
  return { map, requests, errors };
}

async function data(page: Page) {
  return page
    .getByTestId('bagua-master-map')
    .evaluate((el) => ({ ...(el as HTMLElement).dataset }));
}

test.describe('BAGUA MASTER · rutas de recolección', () => {
  test('RT-01 las rutas no se piden hasta activarlas y el panel lista los recorridos', async ({
    page,
  }) => {
    const { requests, errors } = await openMaster(page);
    expect(requests.filter((u) => /\/bagua-master\/rutas/.test(u))).toEqual([]);
    await expect(page.getByTestId('bm-rutas-panel')).toHaveCount(0);
    await page.getByTestId('bm-rutas-boton').click();
    const panel = page.getByTestId('bm-rutas-panel');
    await expect(panel).toBeVisible();
    for (const code of ['MUN-1001', 'MUN-2001', 'MUN-2002', 'CAD-2026'])
      await expect(page.getByTestId(`bm-ruta-${code}`)).toBeVisible();
    await expect(page.getByTestId('bm-ruta-MUN-1001')).toContainText('Ruta 1001');
    // Fuente única DWG: las rutas procedentes de PDF no están en el catálogo.
    await expect(page.getByTestId('bm-ruta-MUN-COMERCIAL')).toHaveCount(0);
    await expect(page.getByTestId('bm-ruta-MUN-INSTITUCIONAL')).toHaveCount(0);
    await expect(page.locator('[data-testid^="bm-ruta-"]')).toHaveCount(7);
    await expect(panel).toContainText('no se ajustan');
    expect(errors).toEqual([]);
  });

  test('RT-02 elegir una ruta la destaca, muestra su ficha y permite volver', async ({ page }) => {
    const { map } = await openMaster(page);
    await page.getByTestId('bm-rutas-boton').click();
    await page.getByTestId('bm-ruta-MUN-2001').click();
    await expect(map).toHaveAttribute('data-ruta-seleccionada', 'MUN-2001');
    const ficha = page.getByTestId('bm-ruta-ficha');
    await expect(ficha).toContainText('Georreferenciada');
    await expect(ficha).toContainText('Longitud de trazos');
    await expect(ficha).toContainText('Suma de trazos');
    await expect(ficha).toContainText('RUTAS CON TIEMPO.dwg');
    await expect(ficha).toContainText('flechas del plano');
    await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30_000 });
    await expect.poll(async () => Number((await data(page)).rutasTrazos)).toBeGreaterThan(0);
    await page.getByTestId('bm-rutas-todas').click();
    await expect(map).toHaveAttribute('data-ruta-seleccionada', '');
    await expect(page.getByTestId('bm-ruta-MUN-1001')).toBeVisible();
  });

  test('RT-03 una ruta en revisión se marca como tal y no inventa sentido', async ({ page }) => {
    await openMaster(page);
    await page.getByTestId('bm-rutas-boton').click();
    await page.getByTestId('bm-ruta-MUN-ORGANICA').click();
    const ficha = page.getByTestId('bm-ruta-ficha');
    await expect(ficha).toContainText('En revisión');
    await expect(ficha).toContainText('Sin flechas recuperadas');
    await expect(ficha).toContainText('RUTA ORGANICO.dwg');
  });

  test('RT-04 un clic sobre el trazo selecciona la ruta y ocultar las rutas limpia el mapa', async ({
    page,
  }) => {
    const { map } = await openMaster(page);
    await page.getByTestId('bm-rutas-boton').click();
    await page.getByTestId('bm-ruta-MUN-1001').click();
    await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30_000 });
    await page.getByTestId('bm-rutas-todas').click();
    await expect(map).toHaveAttribute('data-ruta-seleccionada', '');
    // Un trazo visible: su punto en pantalla lo publica el propio mapa para las pruebas.
    await expect.poll(async () => (await data(page)).muestraRuta).toMatch(/^\d+,\d+$/);
    const [x, y] = (await data(page)).muestraRuta!.split(',').map(Number);
    const point = { x: x!, y: y! };
    await map.locator('canvas').click({ position: point });
    await expect(map).toHaveAttribute('data-ruta-seleccionada', /^(MUN|CAD)-/);
    await page.getByRole('button', { name: 'Ocultar rutas' }).click();
    await expect(map).toHaveAttribute('data-rutas', 'ocultas');
    await expect(page.getByTestId('bm-rutas-panel')).toHaveCount(0);
  });

  test('RT-05 el catálogo procede solo de DWG: sin PDF, sin huérfanos', async ({ request }) => {
    const list = await (await request.get('/api/bagua-master/rutas')).json();
    expect(list.rutas.map((r: { codigo: string }) => r.codigo).sort()).toEqual(
      [
        'CAD-2026',
        'CAD-PRIMAVERA',
        'CAD-RUTAS',
        'MUN-1001',
        'MUN-2001',
        'MUN-2002',
        'MUN-ORGANICA',
      ].sort(),
    );
    for (const route of list.rutas) {
      expect(route.fuenteArchivo).toMatch(/\.dwg$/i);
      expect(route.procedencia.trazos).toMatch(/\.dwg$/i);
    }
    const map = await (await request.get('/api/bagua-master/rutas/mapa')).json();
    expect(JSON.stringify([list, map])).not.toMatch(/pdf/i);
    const codes = new Set(list.rutas.map((r: { codigo: string }) => r.codigo));
    expect(map.trazos.features).toHaveLength(7);
    for (const f of [...map.flechas.features, ...map.marcadores.features])
      expect(codes.has(f.properties.ruta)).toBe(true);
    const drawn = list.rutas.reduce(
      (n: number, r: { flechas: { dibujadas: number } }) => n + r.flechas.dibujadas,
      0,
    );
    expect(map.flechas.features).toHaveLength(drawn);
  });
});
