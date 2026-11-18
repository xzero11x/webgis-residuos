import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';
function creds(name: string) {
  const s = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return { usuario: s.match(/^Usuario: (.+)$/m)![1], password: s.match(/^Contraseña: (.+)$/m)![1] };
}
const headers = { 'X-Bagua-Request': '1' };
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('corrección de entrega: UI, versiones, concurrencia, archivo, anulación, reportes e historial', async ({
  page,
}, info) => {
  await requireFixtureTarget(page.request, creds('admin-bagua'));
  await page.request.post('/api/gestion/sesion', { headers, data: creds('admin-bagua') });
  async function create(path: string, data: unknown) {
    const r = await page.request.post('/api/gestion' + path, { headers, data });
    expect(r.status()).toBe(201);
    return r.json();
  }
  const code = 'TEST-DCOR-' + randomUUID().slice(0, 8).toUpperCase();
  const service = await create('/catalogos/servicios', {
    codigo: code,
    nombre: 'Servicio sintético para corrección ' + code,
  });
  const predio = await create('/predios', {
    codigo: code,
    direccion: 'Referencia sintética para corrección versionada',
  });
  const participation = await create(`/predios/${predio.id}/participaciones`, {
    servicioId: service.id,
    periodo: {
      desde: '2026-01-01',
      hasta: '2026-12-31',
      evidencia: 'Participación sintética de ensayo',
    },
  });
  const key = randomUUID(),
    delivery = await create('/entregas', {
      participacionId: participation.id,
      fecha: '2026-01-20',
      material: 'Material sintético inicial',
      cantidad: null,
      unidad: null,
      observaciones: 'Ensayo sin medición',
      clave: key,
    });
  await page.goto(`/bagua-master?trabajo=gestion&predio=${predio.id}`);
  await page.getByRole('tab', { name: 'Entregas', exact: true }).click();
  await page.getByRole('button', { name: 'Corregir entrega', exact: true }).click();
  await page.getByLabel('Material corregido', { exact: true }).fill('Material sintético corregido');
  await page.getByLabel('Cantidad corregida (si se midió)', { exact: true }).fill('5');
  await page.getByRole('combobox', { name: /^Unidad corregida/ }).selectOption('kg');
  await page
    .getByLabel('Motivo de corrección', { exact: true })
    .fill('Transcripción sintética revisada contra ficha de ensayo');
  await page.getByRole('button', { name: 'Guardar corrección de entrega', exact: true }).click();
  await expect(
    page.getByText('Corrección guardada como nueva versión de la misma entrega.', { exact: true }),
  ).toBeVisible();
  const path = '/api/gestion/entregas/' + delivery.id;
  const revision = await (await page.request.get(path + '/revisiones')).json();
  expect(revision.items).toHaveLength(1);
  expect(revision.items[0].anterior.cantidad).toBeNull();
  expect(Number(revision.items[0].nuevo.cantidad)).toBe(5);
  const detail = await (await page.request.get(`/api/gestion/predios/${predio.id}`)).json();
  expect(detail.entregas).toHaveLength(1);
  expect(detail.entregas[0].id).toBe(delivery.id);
  expect(detail.entregas[0].version).toBe(2);
  const body = {
    version: 2,
    motivo: 'Segunda corrección sintética documentada',
    fecha: '2026-01-20',
    material: 'Material sintético corregido',
    cantidad: 7,
    unidad: 'kg',
    observaciones: 'Ensayo corregido',
  };
  const concurrent = await Promise.all([
    page.request.patch(path, { headers, data: body }),
    page.request.patch(path, { headers, data: { ...body, cantidad: 8 } }),
  ]);
  expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect(
    (
      await page.request.post(path + '/anular', {
        headers,
        data: { motivo: 'Petición antigua sin versión no puede anular una entrega corregida' },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch(path, {
        headers,
        data: { ...body, version: 3, cantidad: 1, unidad: null },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch(path, {
        headers,
        data: { ...body, version: 3, participacionId: randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch(path, {
        headers,
        data: { ...body, version: 3, fecha: '2025-12-31' },
      })
    ).status(),
  ).toBe(400);
  const historyAfterFailed = await (await page.request.get(path + '/revisiones')).json();
  expect(historyAfterFailed.items).toHaveLength(2);
  const reports = await (
    await page.request.get(
      `/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31&servicio=${service.id}`,
    )
  ).json();
  expect(reports.items).toHaveLength(1);
  expect(reports.items[0].entregas).toBe(1);
  expect(Number(reports.items[0].cantidad)).toBe(
    Number(historyAfterFailed.items[0].nuevo.cantidad),
  );
  await page.request.post(`/api/gestion/predios/${predio.id}/archivo`, {
    headers,
    data: { archivado: true, version: 1, motivo: 'Archivo sintético para verificar restricciones' },
  });
  expect(
    (await page.request.patch(path, { headers, data: { ...body, version: 3 } })).status(),
  ).toBe(400);
  await page.request.post(`/api/gestion/predios/${predio.id}/archivo`, {
    headers,
    data: { archivado: false, version: 2, motivo: 'Restauración sintética conservando entregas' },
  });
  expect(
    (
      await page.request.post(path + '/anular', {
        headers,
        data: { motivo: 'Anulación con versión desactualizada', version: 2 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(path + '/anular', {
        headers,
        data: { motivo: 'Anulación sintética justificada de ensayo', version: 3 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.patch(path, { headers, data: { ...body, version: 4 } })).status(),
  ).toBe(409);
  expect((await (await page.request.get(path + '/revisiones')).json()).items).toHaveLength(3);
  expect(
    (
      await (
        await page.request.get(
          `/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31&servicio=${service.id}`,
        )
      ).json()
    ).items,
  ).toEqual([]);
  await page.reload();
  await page.getByRole('tab', { name: 'Entregas', exact: true }).click();
  await page.getByText('Revisiones de esta entrega · versión 4', { exact: true }).click();
  await expect(page.getByText('Anterior:', { exact: false }).first()).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/entrega-correccion-${info.project.name}.png`,
  });
  await page.request.post('/api/gestion/sesion', { headers, data: creds('consulta-bagua') });
  expect(
    (await page.request.patch(path, { headers, data: { ...body, version: 4 } })).status(),
  ).toBe(403);
  expect((await page.request.get(path + '/revisiones')).status()).toBe(403);
});
