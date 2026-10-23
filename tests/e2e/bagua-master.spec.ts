import { expect, test, type Page, type Request } from '@playwright/test';

// BAGUA MASTER: 15 verificaciones del módulo nuevo y 7 de no regresión del mapa municipal.
const VERSION = '2026-09-23.1';

function track(page: Page) {
  const requests: Request[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

async function openMaster(page: Page) {
  await page.goto('/bagua-master');
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
  return map;
}

async function dataset(page: Page) {
  return page
    .getByTestId('bagua-master-map')
    .evaluate((el) => ({ ...(el as HTMLElement).dataset }));
}

async function clickSample(page: Page, key: 'muestraEdificio' | 'muestraVia') {
  const point = (await dataset(page))[key];
  expect(point, `sin ${key} visible`).toMatch(/^\d+,\d+$/);
  const [x, y] = point!.split(',').map(Number);
  await page
    .getByTestId('bagua-master-map')
    .locator('canvas')
    .click({ position: { x: x!, y: y! } });
}

async function waitIdle(page: Page) {
  const map = page.getByTestId('bagua-master-map');
  await expect(map)
    .toHaveAttribute('data-idle', 'false', { timeout: 5_000 })
    .catch(() => {});
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30_000 });
}

test.describe('BAGUA MASTER', () => {
  test('BM-01 entrada en la barra lateral y ruta propia', async ({ page }) => {
    await page.goto('/');
    if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible())
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
    const link = page.getByRole('link', { name: /BAGUA MASTER/ });
    await expect(link).toContainText('Nueva cartografía urbana');
    await link.click();
    await expect(page).toHaveURL(/\/bagua-master$/);
    await expect(page.getByRole('heading', { name: 'BAGUA MASTER', level: 1 })).toBeVisible();
    await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
  });

  test('BM-02 solo recursos propios: ningún proveedor externo de mapas', async ({ page }) => {
    const { requests, errors } = track(page);
    await openMaster(page);
    const origin = new URL(page.url()).origin;
    const external = requests
      .map((r) => r.url())
      .filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith(origin));
    expect(external).toEqual([]);
    expect(requests.some((r) => /openfreemap|tiles\.|basemaps|maptiler|mapbox/.test(r.url()))).toBe(
      false,
    );
    // El módulo no consulta la API municipal.
    expect(
      requests.some((r) => /\/api\/(municipal|capas|predios|territorio|catalogos)/.test(r.url())),
    ).toBe(false);
    expect(errors).toEqual([]);
  });

  test('BM-03 teselas PMTiles servidas por rangos HTTP', async ({ page, request }) => {
    const responses: { status: number; range: string | undefined }[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/bagua-master/teselas/'))
        responses.push({ status: r.status(), range: r.request().headers()['range'] });
    });
    await openMaster(page);
    expect(responses.length).toBeGreaterThan(1);
    expect(responses.every((r) => r.status === 206 && !!r.range)).toBe(true);
    const head = await request.get('/api/bagua-master/teselas/bagua-master.pmtiles', {
      headers: { Range: 'bytes=0-6' },
    });
    expect(head.status()).toBe(206);
    expect((await head.body()).toString()).toBe('PMTiles');
  });

  test('BM-04 versión del snapshot y atribución', async ({ page, request }) => {
    const summary = await (await request.get('/api/bagua-master/resumen')).json();
    expect(summary.version.overture).toBe(VERSION);
    expect(summary.version.esquema).toBe('v2.0.0');
    await openMaster(page);
    await expect(page.getByTestId('bm-version')).toHaveText(`Overture Maps ${VERSION}`);
    const attribution = page.locator('.maplibregl-ctrl-attrib-inner');
    await expect(attribution).toContainText('Overture Maps Foundation');
    await expect(attribution).toContainText(VERSION);
    await expect(attribution).toContainText('OpenStreetMap');
  });

  test('BM-05 calles dibujadas', async ({ page }) => {
    await openMaster(page);
    expect(Number((await dataset(page)).calles)).toBeGreaterThan(50);
  });

  test('BM-06 edificaciones dibujadas', async ({ page }) => {
    await openMaster(page);
    expect(Number((await dataset(page)).edificios)).toBeGreaterThan(200);
  });

  test('BM-07 nombres de calles y lugares legibles', async ({ page }) => {
    await openMaster(page);
    const data = await dataset(page);
    expect(Number(data.rotulos)).toBeGreaterThan(0);
    expect(Number(data.lugares)).toBeGreaterThan(0);
  });

  test('BM-08 acercar, alejar y desplazar', async ({ page }) => {
    await openMaster(page);
    const z0 = Number((await dataset(page)).zoom);
    await page.getByRole('button', { name: 'Acercar' }).click();
    await waitIdle(page);
    expect(Number((await dataset(page)).zoom)).toBeGreaterThan(z0 + 0.5);
    await page.getByRole('button', { name: 'Alejar' }).click();
    await waitIdle(page);
    expect(Number((await dataset(page)).zoom)).toBeCloseTo(z0, 0);
    const before = (await dataset(page)).centro;
    const box = (await page.getByTestId('bagua-master-map').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 8 });
    await page.mouse.up();
    await waitIdle(page);
    expect((await dataset(page)).centro).not.toBe(before);
    await page.getByRole('button', { name: 'Centrar en Bagua' }).click();
    await waitIdle(page);
    expect(Number((await dataset(page)).zoom)).toBeCloseTo(16.2, 1);
  });

  test('BM-09 selección de edificación con datos reales de Overture', async ({ page, request }) => {
    await openMaster(page);
    await clickSample(page, 'muestraEdificio');
    const info = page.getByTestId('bm-info');
    await expect(info).toContainText('Edificación');
    await expect(info).toContainText('Identificador Overture');
    await expect(info.locator('.bm-mono')).toHaveText(/^[0-9a-f-]{36}$/);
    await expect(info).toContainText('Superficie (calculada)');
    // La fuente mostrada es la que Overture declara para ese edificio.
    const id = (await info.locator('.bm-mono').textContent())!;
    const element = await (await request.get(`/api/bagua-master/elementos/edificio/${id}`)).json();
    expect(element.fuentes.length).toBeGreaterThan(0);
    await expect(info).toContainText(element.fuentes[0].dataset);
    await expect(info).toContainText(`Overture Maps ${VERSION}`);
    // Sin alturas en Overture para Bagua: no se muestra una altura inventada.
    await expect(info).toContainText('No publicada por Overture');
    await expect(info).not.toContainText('Altura (Overture)');
  });

  test('BM-10 selección de vía con nombre, clase y longitud', async ({ page }) => {
    await openMaster(page);
    await clickSample(page, 'muestraVia');
    const info = page.getByTestId('bm-info');
    await expect(info).toContainText('Vía');
    await expect(info).toContainText('Longitud (calculada)');
    await expect(info).toContainText('Tipo');
    await page.getByRole('button', { name: 'Cerrar información' }).click();
    await expect(info).toHaveCount(0);
  });

  test('BM-11 2.5D solo con alturas reales', async ({ page, request }) => {
    const summary = await (await request.get('/api/bagua-master/resumen')).json();
    await openMaster(page);
    const button = page.getByTestId('bm-modo-3d');
    if (summary.alturas.conAltura === 0) {
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('title', /no se inventan/);
      await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-modo', '2d');
      expect((await dataset(page)).pitch).toBe('0');
    } else {
      await button.click();
      await waitIdle(page);
      expect(Number((await dataset(page)).pitch)).toBeGreaterThan(30);
    }
  });

  test('BM-12 búsqueda de lugares', async ({ page }) => {
    await openMaster(page);
    await page
      .getByRole('searchbox', { name: 'Buscar calle o lugar en Bagua' })
      .fill('plaza de armas');
    await page.getByRole('button', { name: /Plaza de Armas Bagua/ }).click();
    const info = page.getByTestId('bm-info');
    await expect(info).toContainText('Plaza de Armas Bagua');
    await expect(info).toContainText('Lugar');
    await waitIdle(page);
    expect(Number((await dataset(page)).zoom)).toBeGreaterThan(17);
  });

  test('BM-13 resultados sin duplicados ni datos personales', async ({ page, request }) => {
    const results = await (await request.get('/api/bagua-master/buscar?q=jir')).json();
    const names = results.map((r: { nombre: string }) => r.nombre);
    expect(names.length).toBeGreaterThan(5);
    expect(new Set(names).size).toBe(names.length);
    await openMaster(page);
    await page
      .getByRole('searchbox', { name: 'Buscar calle o lugar en Bagua' })
      .fill('plaza de armas');
    await page.getByRole('button', { name: /Plaza de Armas Bagua/ }).click();
    const info = page.getByTestId('bm-info');
    await expect(info).toContainText('Fuente');
    for (const hidden of ['phones', 'emails', 'socials', 'filename'])
      await expect(info).not.toContainText(hidden);
  });

  test('BM-14 escritorio y celular: sin desbordes, ficha como panel inferior', async ({
    page,
  }, info) => {
    const { errors } = track(page);
    await openMaster(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const viewport = page.viewportSize()!;
    const controls = (await page.locator('.bm-controls').boundingBox())!;
    expect(controls.x + controls.width).toBeLessThanOrEqual(viewport.width);
    await clickSample(page, 'muestraEdificio');
    const panel = (await page.getByTestId('bm-info').boundingBox())!;
    if (info.project.name === 'mobile') {
      expect(Math.round(panel.y + panel.height)).toBe(viewport.height);
      expect(panel.width).toBeCloseTo(viewport.width, -1);
      await page.getByRole('button', { name: 'Plegar información' }).click();
      await expect(page.getByRole('button', { name: 'Mostrar información' })).toBeVisible();
    } else {
      expect(panel.width).toBeLessThan(380);
    }
    await page.screenshot({ path: `artifacts/screenshots/bagua-master-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });

  test('BM-15 alcance de datos: Overture estructural, rutas documentales aparte y sin predios', async ({
    request,
  }) => {
    const summary = await (await request.get('/api/bagua-master/resumen')).json();
    const tables = summary.elementos.map((e: { tabla: string }) => e.tabla).sort();
    expect(tables).toEqual(
      [
        'agua',
        'conector',
        'edificio',
        'lugar',
        'parte_edificio',
        'red_vial',
        'terreno',
        'uso_suelo',
      ].sort(),
    );
    for (const e of summary.elementos) expect(e.invalidas).toBe(0);
    expect(summary.elementos.find((e: { tabla: string }) => e.tabla === 'edificio').total).toBe(
      14357,
    );
    // Las rutas (fase 2) son un conjunto aparte: no son una tabla de Overture ni un elemento seleccionable.
    expect((await request.get('/api/bagua-master/rutas')).status()).toBe(200);
    for (const url of ['predios', 'elementos/rutas/x', 'elementos/predio/x'])
      expect([400, 404]).toContain((await request.get(`/api/bagua-master/${url}`)).status());
    expect((await request.post('/api/bagua-master/elementos/edificio/x')).status()).toBe(404);
  });
});

test.describe('Mapa municipal sin regresiones', () => {
  test('MAP-01 el mapa municipal sigue cargando en /', async ({ page }) => {
    const { errors } = track(page);
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    expect(errors).toEqual([]);
  });

  test('MAP-02 el mapa municipal no carga nada de BAGUA MASTER', async ({ page }) => {
    const { requests } = track(page);
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle');
    expect(requests.filter((r) => /bagua-master|pmtiles/.test(r.url()))).toEqual([]);
  });

  test('MAP-03 la navegación vuelve al mapa general', async ({ page }) => {
    await openMaster(page);
    if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible())
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await page.getByRole('link', { name: 'Mapa general', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
  });

  test('MAP-04 la búsqueda territorial sigue en el mapa general y no en BAGUA MASTER', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'La búsqueda de cabecera se oculta en celular.');
    await page.goto('/');
    await expect(page.locator('.header-search')).toBeVisible();
    await openMaster(page);
    await expect(page.locator('.header-search')).toHaveCount(0);
  });

  test('MAP-05 rutas municipales intactas', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop', 'La integridad de datos no depende del viewport.');
    const { rutas } = await (await request.get('/api/capas')).json();
    const municipal = rutas.features.filter(
      (r: { properties: { isDemo: boolean } }) => !r.properties.isDemo,
    );
    expect(municipal).toHaveLength(9);
  });

  test('MAP-06 API municipal y documentación siguen disponibles', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop', 'La integridad de datos no depende del viewport.');
    expect((await request.get('/api/municipal/resumen')).status()).toBe(200);
    const document = await (await request.get('/api/openapi.json')).json();
    expect(document.paths['/predios']).toBeDefined();
  });

  test('MAP-07 ir y volver entre módulos no produce errores', async ({ page }) => {
    const { errors } = track(page);
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await openMaster(page);
    await page.goBack();
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await page.goForward();
    await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    expect(errors).toEqual([]);
  });
});
