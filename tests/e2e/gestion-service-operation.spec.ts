import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';
function creds(name: string) {
  const value = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return {
    usuario: value.match(/^Usuario: (.+)$/m)![1],
    password: value.match(/^Contraseña: (.+)$/m)![1],
  };
}
const headers = { 'X-Bagua-Request': '1' };
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('servicio: asignación, participación y entrega independientes, paginación y navegación al predio', async ({
  page,
}, info) => {
  await requireFixtureTarget(page.request, creds('admin-bagua'));
  await page.request.post('/api/gestion/sesion', { headers, data: creds('admin-bagua') });
  async function create(path: string, data: unknown) {
    const r = await page.request.post('/api/gestion' + path, { headers, data });
    expect(r.status()).toBe(201);
    return r.json();
  }
  const code = 'TEST-SOP-' + randomUUID().slice(0, 8).toUpperCase();
  const service = await create('/catalogos/servicios', {
    codigo: code,
    nombre: 'Servicio sintético ' + code,
  });
  const predio = await create('/predios', {
    codigo: code,
    direccion: 'Referencia ficticia operativa sin localización',
  });
  for (let day = 1; day <= 26; day++) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    await create(`/predios/${predio.id}/asignaciones`, {
      servicioId: service.id,
      estado: 'pendiente',
      periodo: { desde: date, hasta: date, evidencia: 'Periodo diario sintético para paginación' },
    });
  }
  const route = `/api/gestion/servicios/${service.id}/operacion`;
  const first = await (await page.request.get(route)).json();
  const second = await (await page.request.get(route + '?page=2')).json();
  expect(first.items).toHaveLength(25);
  expect(first.hayMas).toBe(true);
  expect(second.items).toHaveLength(1);
  expect(second.hayMas).toBe(false);
  expect(first.items.map((r: { id: string }) => r.id)).not.toContain(second.items[0].id);
  expect((await (await page.request.get(route + '?tipo=participaciones')).json()).items).toEqual(
    [],
  );
  const participant = await create(`/predios/${predio.id}/participaciones`, {
    servicioId: service.id,
    periodo: {
      desde: '2026-01-01',
      hasta: null,
      evidencia: 'Inscripción sintética sin implicar entrega',
    },
  });
  expect((await (await page.request.get(route + '?tipo=entregas')).json()).items).toEqual([]);
  const material = (await (await page.request.get('/api/gestion/catalogos/materiales')).json())
    .items[0];
  await create('/entregas', {
    participacionId: participant.id,
    fecha: '2026-01-20',
    material: material.nombre,
    cantidad: null,
    unidad: null,
    observaciones: 'Evento sintético sin medición',
    clave: randomUUID(),
  });
  expect((await page.request.get(route + '?page=0')).status()).toBe(400);
  expect((await page.request.get(route + '?tipo=personas')).status()).toBe(400);
  expect(
    (await page.request.get(`/api/gestion/servicios/${randomUUID()}/operacion`)).status(),
  ).toBe(404);
  await page.request.post('/api/gestion/sesion', { headers, data: creds('consulta-bagua') });
  const delivered = await (await page.request.get(route + '?tipo=entregas')).json();
  expect(delivered.items).toHaveLength(1);
  expect(delivered.items[0].cantidad).toBeNull();
  expect(delivered.items[0]).not.toHaveProperty('responsable_id');
  expect(delivered.items[0]).not.toHaveProperty('observaciones');
  expect(delivered.items[0]).not.toHaveProperty('persona');
  await page.goto('/bagua-master?trabajo=gestion&vista=servicios');
  await page.getByLabel('Servicio a consultar').selectOption(service.id);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Página 2', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Consultar predio ${code}`, exact: true }),
  ).toHaveCount(1);
  await page.getByRole('combobox', { name: /^Registros del servicio/ }).selectOption('entregas');
  await expect(page.getByText('Página 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/Sin medición/)).toBeVisible();
  await expect(page.getByText(/Registrar actividad en/)).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/screenshots/servicio-operacion-${info.project.name}.png`,
  });
  await page.evaluate(() => {
    (window as unknown as { keptMap: Element | null }).keptMap =
      document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: `Consultar predio ${code}`, exact: true }).click();
  await expect(
    page.getByRole('article', { name: 'Ficha administrativa del predio' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { keptMap: Element | null }).keptMap ===
        document.querySelector('.maplibregl-canvas'),
    ),
  ).toBe(true);
});
