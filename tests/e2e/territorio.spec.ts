import { expect, test } from '@playwright/test';

// Territorio unificado: integridad de la base, reglas de identidad y visualización en el mapa.
const WINDOW = 'bbox=-78.5450,-5.6460,-78.5260,-5.6250';
const ALL_KINDS =
  'clase=manzana,lote,vivienda,calle,sector,ruta,ruta_candidata,punto_topografico,sombreado,hoja,cota,institucion,hidrografia,plano_ubicacion';
// Marcadores de trámite personal que nunca deben aparecer en respuestas públicas.
const PRIVATE = /PROPIETARIO|TITULAR|SUCESI|CERTIF|POSES|POSEC|RESOLUC|SUB ?DIVI|ESPOSO/i;

test('territorio unificado: resumen, identidad, relaciones y privacidad', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Una comprobación de datos es suficiente.');
  const summary = await (await request.get('/api/municipal/territorio/resumen')).json();
  expect(summary.checksum).toMatch(/^[0-9a-f]{64}$/);
  expect(summary.identidad.violaciones).toBe(0);
  expect(summary.identidad.representaciones_verificadas).toBeGreaterThan(30000);
  const byKind = Object.fromEntries(
    summary.counts.map((c: { kind: string; entidades: number }) => [c.kind, c.entidades]),
  );
  expect(byKind.ruta).toBe(9);
  expect(byKind.ruta_candidata).toBe(3);
  expect(byKind.plano_ubicacion).toBeGreaterThan(3000);
  const causa = (name: string) =>
    summary.excepciones.find((e: { causa: string }) => e.causa === name)?.total;
  expect(causa('marco_indeterminado')).toBe(7);
  expect(causa('geometria_no_valida_sin_reparar')).toBe(48);

  // Las viviendas no se funden con los lotes que tienen la misma forma.
  const lotes = await (
    await request.get(`/api/municipal/territorio/entidades?clase=lote&${WINDOW}`)
  ).json();
  const viviendas = await (
    await request.get(`/api/municipal/territorio/entidades?clase=vivienda&${WINDOW}`)
  ).json();
  expect(lotes.features.length).toBeGreaterThan(0);
  expect(viviendas.features.length).toBeGreaterThan(0);
  const loteIds = new Set(lotes.features.map((f: { id: string }) => f.id));
  expect(viviendas.features.some((f: { id: string }) => loteIds.has(f.id))).toBe(false);

  // Una vivienda copiada en varios DWG de rutas es una sola entidad con varias fuentes.
  const copia = viviendas.features.find(
    (f: { properties: { representaciones: number } }) => f.properties.representaciones > 1,
  );
  expect(copia).toBeTruthy();
  const ficha = await (await request.get(`/api/municipal/territorio/entidades/${copia.id}`)).json();
  expect(ficha.representaciones.length).toBe(copia.properties.representaciones);
  expect(
    new Set(ficha.representaciones.map((r: { fuente: string }) => r.fuente)).size,
  ).toBeGreaterThan(1);
  const forma = ficha.relaciones.find(
    (r: { tipo: string }) => r.tipo === 'forma_coincidente_otra_clase',
  );
  if (forma) {
    expect(forma.entidad.kind).toBe('lote');
    expect(forma.entidad.id).not.toBe(copia.id);
  }

  // Rutas independientes: compartir calles no las fusiona.
  const rutas = await (
    await request.get(`/api/municipal/territorio/entidades?clase=ruta&${WINDOW}`)
  ).json();
  expect(new Set(rutas.features.map((f: { id: string }) => f.id)).size).toBe(rutas.features.length);

  // Privacidad: ninguna respuesta de la ventana contiene marcadores de trámite personal.
  const everything = await (
    await request.get(`/api/municipal/territorio/entidades?${ALL_KINDS}&${WINDOW}`)
  ).json();
  const body = JSON.stringify([lotes, viviendas, rutas, everything, ficha, summary]);
  expect(body).not.toMatch(PRIVATE);
  expect(body).not.toContain('coordenadasBrutas');

  // Errores de consulta.
  expect((await request.get('/api/municipal/territorio/entidades?clase=lote')).status()).toBe(400);
  expect(
    (
      await request.get('/api/municipal/territorio/entidades/00000000-0000-0000-0000-000000000000')
    ).status(),
  ).toBe(404);
  expect((await request.get('/api/municipal/territorio/entidades/no-es-uuid')).status()).toBe(400);
});

test('territorio unificado: capas, Técnico y ficha única en el mapa', async ({ page }, info) => {
  test.skip(
    info.project.name === 'tablet',
    'Escritorio y móvil cubren las capas y la ficha; el diseño de tablet no deja el mapa en la rejilla de búsqueda.',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const map = page.getByTestId('territorial-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await page.locator('.layer-control > summary').click();
  await expect(page.getByRole('checkbox', { name: 'Manzanas', exact: true })).toBeChecked();
  // Los lotes y viviendas son de revisión: en Operativo no aparecen en el menú.
  await expect(
    page.getByRole('checkbox', { name: 'Lotes y viviendas · zoom alto', exact: true }),
  ).toHaveCount(0);
  await page.locator('.layer-control > summary').click();
  await expect
    .poll(async () => Number(await map.getAttribute('data-territorio')), { timeout: 30000 })
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Técnico', exact: true }).click();
  await page.locator('.layer-control > summary').click();
  await page.getByRole('checkbox', { name: 'Lotes y viviendas · zoom alto', exact: true }).check();
  await page
    .getByRole('checkbox', { name: 'Trazos candidatos de bloques · por revisar', exact: true })
    .check();
  await page.locator('.layer-control > summary').click();
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 30000 });
  await expect
    .poll(async () => Number(await map.getAttribute('data-territorio')), { timeout: 30000 })
    .toBeGreaterThan(100);
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-territorio-tecnico.png`,
    fullPage: true,
  });

  // Un clic sobre el mapa abre una única ficha territorial con procedencia.
  const box = (await map.boundingBox())!;
  let opened = false;
  for (let fy = 0.3; fy < 0.8 && !opened; fy += 0.05)
    for (let fx = 0.35; fx < 0.8 && !opened; fx += 0.05) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      opened = await page
        .locator('.territorial-detail')
        .isVisible()
        .catch(() => false);
    }
  expect(opened).toBe(true);
  const panel = page.locator('.territorial-detail');
  await expect(panel).toContainText('Fuentes vinculadas');
  await expect(panel).toContainText('Relaciones con otras entidades');
  await expect(page.locator('.territorial-detail')).toHaveCount(1);
  await page.screenshot({
    path: `artifacts/screenshots/${info.project.name}-territorio-ficha.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cerrar ficha territorial' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
