import { expect, test } from '@playwright/test';

test('selección directa de un polígono y una ruta sobre el mapa', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Comprueba interacciones cartográficas con coordenadas de la cámara inicial.',
  );
  const predios = await (await request.get('/api/predios?q=DEMO-')).json();
  const layers = await (await request.get('/api/capas')).json();
  for (const kind of ['predio', 'ruta']) {
    await page.goto('/');
    await expect(page.getByTestId('territorial-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60_000,
    });
    await page.getByRole('tab', { name: 'Predios DEMO', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ver predio DEMO-001', exact: true }),
    ).toBeVisible();
    const box = (await page.getByTestId('territorial-map').boundingBox())!;
    const world = 512 * 2 ** 16.3;
    const mercatorY = (lat: number) =>
      (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
    const project = (p: number[]) => ({
      x: box.x + box.width / 2 + ((p[0]! + 78.5367) / 360) * world,
      y: box.y + box.height / 2 + (mercatorY(p[1]!) - mercatorY(-5.6378)) * world,
    });
    const candidates =
      kind === 'predio'
        ? predios.items.map((p: { codigo: string; geometry: { coordinates: number[][][] } }) => {
            const ring = p.geometry.coordinates[0]!.slice(0, -1);
            return {
              label: p.codigo,
              point: [
                ring.reduce((sum, v) => sum + v[0]!, 0) / ring.length,
                ring.reduce((sum, v) => sum + v[1]!, 0) / ring.length,
              ],
            };
          })
        : layers.rutas.features
            .filter(
              (r: { properties: { isDemo: boolean; status: string } }) =>
                !r.properties.isDemo && r.properties.status === 'georreferenciada',
            )
            .flatMap(
              (r: { properties: { nombre: string }; geometry: { coordinates: number[][][] } }) =>
                r.geometry.coordinates[0]!.slice(1).map((p, i) => ({
                  label: r.properties.nombre,
                  point: [
                    (p[0]! + r.geometry.coordinates[0]![i]![0]!) / 2,
                    (p[1]! + r.geometry.coordinates[0]![i]![1]!) / 2,
                  ],
                })),
            );
    let clicked = false;
    for (const candidate of candidates) {
      const point = project(candidate.point);
      if (
        point.x < box.x + 330 ||
        point.x > box.x + box.width - 70 ||
        point.y < box.y + 120 ||
        point.y > box.y + box.height - 100
      )
        continue;
      // Retry the same real pointer click until asynchronous GeoJSON rendering finishes.
      await expect(async () => {
        await page.mouse.click(point.x, point.y);
        const panel =
          kind === 'predio'
            ? page.getByRole('complementary', { name: 'Ficha del predio' })
            : page.getByRole('complementary', { name: 'Ficha de capa' });
        await expect(panel).toContainText(candidate.label, { timeout: 1000 });
      }).toPass({ timeout: 10_000 });
      clicked = true;
      break;
    }
    expect(clicked).toBe(true);
  }
});

test('transacciones, versión concurrente y geometrías válidas en PostGIS', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'La integridad de API no depende del viewport.');
  const catalogos = await (await request.get('/api/catalogos')).json();
  const code = `E2E-API-${Date.now()}`;
  const input = {
    codigo: code,
    direccion: 'Prueba transaccional DEMO',
    sectorId: catalogos.sectores[0].id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-78.537, -5.637],
          [-78.5368, -5.637],
          [-78.5368, -5.6368],
          [-78.537, -5.637],
        ],
      ],
    },
    personas: [{ nombre: 'Persona DEMO API', vinculo: 'Contribuyente' }],
    servicios: [{ servicioId: catalogos.rutas[0].servicioId, rutaId: catalogos.rutas[0].id }],
  };
  let id: string | undefined;
  try {
    const create = await request.post('/api/predios', { data: input });
    expect(create.status(), await create.text()).toBe(201);
    id = (await create.json()).id;
    expect((await request.post('/api/predios', { data: input })).status()).toBe(409);
    expect(
      (
        await request.put(`/api/predios/${id}`, {
          data: { ...input, version: 1, direccion: 'Cambio persistido' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await request.put(`/api/predios/${id}`, { data: { ...input, version: 1 } })).status(),
    ).toBe(409);
    const otherService = catalogos.servicios.find(
      (s: { id: string }) => s.id !== input.servicios[0]!.servicioId,
    );
    expect(
      (
        await request.put(`/api/predios/${id}`, {
          data: {
            ...input,
            version: 2,
            servicios: [{ servicioId: otherService.id, rutaId: input.servicios[0]!.rutaId }],
          },
        })
      ).status(),
    ).toBe(400);
    const after = await (await request.get(`/api/predios/${id}`)).json();
    expect(after).toMatchObject({
      version: 2,
      direccion: 'Cambio persistido',
      personas: input.personas,
    });
    expect(after.servicios[0].servicioId).toBe(input.servicios[0]!.servicioId);
    const bowtie = {
      type: 'Polygon',
      coordinates: [
        [
          [-78.537, -5.637],
          [-78.536, -5.636],
          [-78.536, -5.637],
          [-78.537, -5.636],
          [-78.537, -5.637],
        ],
      ],
    };
    expect(
      (
        await request.post('/api/predios', {
          data: { ...input, codigo: `${code}-BAD`, geometry: bowtie },
        })
      ).status(),
    ).toBe(400);
    expect((await (await request.get(`/api/predios?q=${code}-BAD`)).json()).total).toBe(0);
  } finally {
    if (id) {
      const record = await (await request.get(`/api/predios/${id}`)).json();
      await request.delete(`/api/predios/${id}`, { data: { version: record.version } });
    }
  }
});
