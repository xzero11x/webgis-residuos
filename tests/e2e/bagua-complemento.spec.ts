import { expect, test, type Page } from '@playwright/test';

// Capa complementaria de edificaciones: huellas de OSM, Microsoft, Google y presencia satelital que
// Overture no tiene. Es aditiva: nunca sustituye ni altera los 14.357 edificios de Overture.
const OVERTURE_BUILDINGS = 14357;

async function openMaster(page: Page) {
  await page.goto('/bagua-master');
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60_000 });
  return map;
}

const visible = async (page: Page) =>
  Number(await page.getByTestId('bagua-master-map').getAttribute('data-complemento'));

test.describe('Edificaciones complementarias', () => {
  test('el contrato publica solo huellas con procedencia y no toca Overture', async ({
    request,
  }) => {
    const map = await (await request.get('/api/bagua-master/complemento/mapa')).json();
    const summary = await (await request.get('/api/bagua-master/resumen')).json();
    expect(map.features.length).toBeGreaterThan(0);
    for (const feature of map.features) {
      expect(feature.properties.id).toMatch(/^cmp-[a-z_]+-[0-9a-f]{12}$/);
      expect(['alta', 'media', 'baja']).toContain(feature.properties.confianza);
      expect(feature.properties.fuente).toBeTruthy();
      expect(feature.geometry.type).toBe('Polygon');
    }
    expect(new Set(map.features.map((f: { id: string }) => f.id)).size).toBe(map.features.length);
    expect(summary.complemento.total).toBe(map.features.length);
    // La base de Overture sigue intacta.
    const buildings = summary.elementos.find((e: { tabla: string }) => e.tabla === 'edificio');
    expect(buildings.total).toBe(OVERTURE_BUILDINGS);
  });

  test('se dibuja y al consultarla muestra su origen y altura', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'Interacción de mapa en escritorio.');
    const map = await openMaster(page);
    await expect.poll(() => visible(page), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(map).toHaveAttribute('data-muestra-complemento', /^\d+,\d+$/, { timeout: 30_000 });
    const [x, y] = (await map.getAttribute('data-muestra-complemento'))!.split(',').map(Number);
    await map.locator('canvas').click({ position: { x: x!, y: y! } });
    const panel = page.getByTestId('bm-info');
    await expect(panel).toContainText('Edificación complementaria');
    await expect(panel).toContainText('Origen de la huella');
    await expect(panel).toContainText('Altura');
    // Sin avisos de duda en la ficha.
    await expect(panel).not.toContainText(/sin confirmar|incompleto|provisional/i);
    // No se presenta como dato de Overture ni de predio.
    await expect(panel).not.toContainText('Identificador Overture');
    await expect(panel).not.toContainText('Predios relacionados');
    const id = (await panel.locator('.bm-mono').first().textContent())!;
    const element = await (
      await request.get(`/api/bagua-master/elementos/edificio_complemento/${id}`)
    ).json();
    expect(element.complemento.licencia).toBeTruthy();
    expect(['google_temporal', 'estimada_default']).toContain(element.complemento.origenAltura);
  });
});
