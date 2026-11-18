import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';
function credentials(name: string) {
  const s = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return { usuario: s.match(/^Usuario: (.+)$/m)![1], password: s.match(/^Contraseña: (.+)$/m)![1] };
}
const headers = { 'X-Bagua-Request': '1' };
test.beforeEach(async ({ request }) => {
  await requireFixtureTarget(request, credentials('admin-bagua'));
});
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('revisión espacial desde mapa conserva ubicación pendiente e historial', async ({
  page,
}, info) => {
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const code = 'TEST-SPATIAL-' + randomUUID().slice(0, 8).toUpperCase();
  const p = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code, direccion: 'Referencia administrativa ficticia sin coordenadas' },
    })
  ).json();
  await page.goto(`/bagua-master?predio=${p.id}`);
  const map = page.getByTestId('bagua-master-map');
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60000 });

  await page.getByRole('link', { name: 'Revisar vínculos espaciales' }).click();
  const panel = page.getByRole('complementary', { name: 'Revisión espacial del predio' });
  await panel.getByRole('button', { name: 'Ampliar revisión' }).click();
  await expect(panel.getByRole('button', { name: 'Reducir revisión' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await panel.getByRole('button', { name: 'Reducir revisión' }).click();
  const box = (await map.boundingBox())!;
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  await expect(map).toHaveAttribute('data-idle', 'true');
  await panel.getByRole('button', { name: 'Examinar edificios en esta vista' }).click();
  await panel.locator('.bm-inspector-list').first().getByRole('button').first().click();
  await expect(panel.getByRole('heading', { name: 'Edificio seleccionado' })).toBeVisible();
  await panel
    .getByLabel('Evidencia de la propuesta')
    .fill('Ensayo sintético: selección humana explícita, no vínculo oficial.');
  await panel.getByRole('button', { name: 'Proponer vínculo para revisión' }).click();
  await expect(panel.getByRole('status')).toContainText('Revisión guardada');
  const state = await (await page.request.get(`/api/gestion/predios/${p.id}/espacial`)).json();
  const link = state.items[0];
  await panel
    .getByLabel(`Decisión ${link.edificio_id}`, { exact: true })
    .selectOption('confirmado');
  await panel
    .getByLabel('Motivo de revisión')
    .fill('Confirmación de vínculo sintético para prueba, sin atribuir identidad jurídica.');
  const shared = panel.getByRole('checkbox');
  if (await shared.isVisible()) await shared.check();
  await panel.getByRole('button', { name: 'Guardar decisión espacial' }).click();
  await expect(panel.getByRole('button', { name: 'Ver geometría confirmado' })).toBeVisible();
  expect(
    (await (await page.request.get(`/api/gestion/predios/${p.id}`)).json()).predio.ubicacion,
  ).toBeNull();
  await page.reload();
  await expect(map).toHaveAttribute('data-idle', 'true', { timeout: 60000 });
  await expect(panel.getByRole('button', { name: 'Ver geometría confirmado' })).toBeVisible();
  await panel.getByRole('button', { name: 'Volver a ficha' }).click();
  await page.getByRole('button', { name: 'Ver geometrías vinculadas' }).click();
  await expect(map).toHaveAttribute('data-idle', 'true');
  await page.getByRole('link', { name: 'Revisar vínculos espaciales' }).click();
  await panel
    .getByLabel(`Decisión ${link.edificio_id}`, { exact: true })
    .selectOption('desvinculado');
  await panel
    .getByLabel('Motivo de revisión')
    .fill('Desvinculación de ensayo conservando trazabilidad.');
  await panel.getByRole('button', { name: 'Guardar decisión espacial' }).click();
  await expect(panel.getByRole('button', { name: 'Ver geometría desvinculado' })).toBeVisible();
  await page.screenshot({ path: `artifacts/screenshots/espacial-${info.project.name}.png` });
  const after = await (await page.request.get(`/api/gestion/predios/${p.id}`)).json();
  expect(after.historial.some((h: { accion: string }) => h.accion === 'espacial.confirmado')).toBe(
    true,
  );
  expect(box.width).toBeGreaterThan(100);
});

test('integridad API: ambigüedad, concurrencia, archivo y permisos', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Integridad API independiente del tamaño.');
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const buildings = await (
    await page.request.get(
      '/api/gestion/espacial/candidatos?oeste=-78.54&este=-78.53&sur=-5.64&norte=-5.63',
    )
  ).json();
  expect(buildings.items.length).toBeGreaterThan(1);
  const edificioId = buildings.items[0].id,
    parents = [];
  for (let i = 0; i < 2; i++)
    parents.push(
      await (
        await page.request.post('/api/gestion/predios', {
          headers,
          data: {
            codigo: 'TEST-SPNEG-' + randomUUID().slice(0, 8),
            direccion: 'Referencia sintética ambigua',
          },
        })
      ).json(),
    );
  const [a, b] = parents;
  const proposal = {
    edificioId,
    criterio: 'seleccion_mapa',
    evidencia: 'Candidato sintético ambiguo bajo revisión',
    versionPredio: 1,
  };
  const first = await (
    await page.request.post(`/api/gestion/predios/${a.id}/espacial`, { headers, data: proposal })
  ).json();
  expect(
    (
      await page.request.post(`/api/gestion/predios/${a.id}/espacial`, { headers, data: proposal })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(`/api/gestion/predios/${a.id}/espacial`, {
        headers,
        data: { ...proposal, edificioId: 'no-existe' },
      })
    ).status(),
  ).toBe(404);
  const decision = {
    estado: 'confirmado',
    motivo: 'Decisión sintética explícita',
    version: 1,
    versionPredio: 1,
    compartido: true,
  };
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${a.id}/espacial/${first.id}`, {
        headers,
        data: decision,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${a.id}/espacial/${first.id}`, {
        headers,
        data: decision,
      })
    ).status(),
  ).toBe(409);
  const second = await (
    await page.request.post(`/api/gestion/predios/${b.id}/espacial`, { headers, data: proposal })
  ).json();
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${b.id}/espacial/${second.id}`, {
        headers,
        data: { ...decision, compartido: false },
      })
    ).status(),
  ).toBe(400);
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      page.request.patch(`/api/gestion/predios/${b.id}/espacial/${second.id}`, {
        headers,
        data: decision,
      }),
    ),
  );
  expect(concurrent.map((response) => response.status()).sort()).toEqual([200, 409]);
  await page.request.post(`/api/gestion/predios/${b.id}/archivo`, {
    headers,
    data: { archivado: true, motivo: 'Archivo sintético de prueba', version: 1 },
  });
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${b.id}/espacial/${second.id}`, {
        headers,
        data: { ...decision, estado: 'desvinculado', version: 2 },
      })
    ).status(),
  ).toBe(409);
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('registro-bagua') });
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${a.id}/espacial/${first.id}`, {
        headers,
        data: { ...decision, estado: 'desvinculado', version: 2 },
      })
    ).status(),
  ).toBe(403);
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('consulta-bagua') });
  expect(
    (
      await page.request.post(`/api/gestion/predios/${a.id}/espacial`, { headers, data: proposal })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get('/api/gestion/espacial/candidatos?oeste=-79&este=-78&sur=-6&norte=-5')
    ).status(),
  ).toBe(400);
});
