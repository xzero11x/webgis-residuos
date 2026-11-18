import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';
const file = readFileSync('artifacts/accesos-locales/admin-bagua.txt', 'utf8');
const admin = {
  usuario: file.match(/^Usuario: (.+)$/m)![1],
  password: file.match(/^Contraseña: (.+)$/m)![1],
};
const headers = { 'X-Bagua-Request': '1' };
test('conciliación selectiva, concurrencia, idempotencia y permiso', async ({ page }, info) => {
  await requireFixtureTarget(page.request, admin);
  await page.request.post('/api/gestion/sesion', { headers, data: admin });
  const code = 'TEST-CONC-' + randomUUID().slice(0, 8).toUpperCase();
  const record = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: {
        codigo: code,
        direccion: 'Dirección local ficticia',
        sector: 'Sector local protegido',
      },
    })
  ).json();
  const payload = {
    version: 1,
    sintetico: true,
    predios: [
      { codigo: code, direccion: 'Dirección externa ficticia', sector: 'Sector externo ficticio' },
    ],
  };
  await page.goto('/bagua-master?trabajo=gestion&vista=importaciones');
  await page.getByLabel('Formato de importación').selectOption('json');
  await page.getByLabel('Lote JSON').fill(JSON.stringify(payload));
  await page.getByRole('button', { name: 'Validar lote', exact: true }).click();
  await page.getByLabel(`Resolución ${code}`, { exact: true }).selectOption('actualizar');
  await page.getByLabel(`Aceptar direccion ${code}`, { exact: true }).check();
  await page.getByRole('button', { name: 'Aplicar lote validado' }).click();
  await expect(page.getByRole('status')).toContainText('1 actualizados');
  const detail = await (await page.request.get(`/api/gestion/predios/${record.id}`)).json();
  expect(detail.predio.direccion).toBe('Dirección externa ficticia');
  expect(detail.predio.sector).toBe('Sector local protegido');
  const batch = await (
    await page.request.post('/api/gestion/importaciones/validar', { headers, data: payload })
  ).json();
  expect(
    (
      await (
        await page.request.post(`/api/gestion/importaciones/${batch.id}/aplicar`, {
          headers,
          data: {},
        })
      ).json()
    ).repetida,
  ).toBe(true);
  const second = {
    ...payload,
    predios: [
      {
        codigo: code,
        direccion: 'Otra corrección externa ficticia',
        sector: 'Sector local protegido',
      },
    ],
  };
  const preview = await (
    await page.request.post('/api/gestion/importaciones/validar', { headers, data: second })
  ).json();
  await page.request.put(`/api/gestion/predios/${record.id}`, {
    headers,
    data: {
      version: detail.predio.version,
      datos: {
        codigo: code,
        direccion: 'Corrección local posterior',
        sector: 'Sector local protegido',
      },
    },
  });
  const resolution = {
    resoluciones: [
      { codigo: code, accion: 'actualizar', version: detail.predio.version, campos: ['direccion'] },
    ],
  };
  expect(
    (
      await page.request.post(`/api/gestion/importaciones/${preview.id}/aplicar`, {
        headers,
        data: resolution,
      })
    ).status(),
  ).toBe(409);
  const fresh = await (
    await page.request.post('/api/gestion/importaciones/validar', { headers, data: second })
  ).json();
  expect(
    (
      await page.request.post(`/api/gestion/importaciones/${fresh.id}/aplicar`, {
        headers,
        data: {
          resoluciones: [{ codigo: code, accion: 'conservar', version: fresh.revision[0].version }],
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await page.request.get(`/api/gestion/predios/${record.id}`)).json()).predio.direccion,
  ).toBe('Corrección local posterior');
  await page.screenshot({ path: `artifacts/screenshots/conciliacion-${info.project.name}.png` });
});

// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('archivo reversible conserva historia, bloquea operaciones y restaura', async ({
  page,
}, info) => {
  await requireFixtureTarget(page.request, admin);
  await page.request.post('/api/gestion/sesion', { headers, data: admin });
  const code = 'TEST-ARCH-' + randomUUID().slice(0, 8).toUpperCase();
  const p = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code, direccion: 'Referencia sintética para archivo' },
    })
  ).json();
  await page.goto(`/bagua-master?predio=${p.id}&trabajo=gestion`);
  await page.getByRole('button', { name: 'Archivar predio', exact: true }).click();
  await page
    .getByLabel('Motivo de archivo o restauración')
    .fill('Ensayo sintético de archivo reversible');
  await page.getByRole('button', { name: 'Confirmar estado del predio' }).click();
  await expect(page.getByRole('article')).toContainText('Archivado');
  expect((await (await page.request.get(`/api/gestion/predios?q=${code}`)).json()).total).toBe(0);
  expect(
    (await (await page.request.get(`/api/gestion/predios?q=${code}&archivo=archivados`)).json())
      .total,
  ).toBe(1);
  const catalog = await (await page.request.get('/api/gestion/catalogos')).json();
  const event = await page.request.post(`/api/gestion/predios/${p.id}/participaciones`, {
    headers,
    data: {
      servicioId: catalog.servicios[0].id,
      periodo: { desde: '2026-01-01', hasta: null, evidencia: 'Prueba sintética' },
    },
  });
  expect(event.status()).toBe(400);
  await page.getByRole('button', { name: 'Restaurar predio', exact: true }).click();
  await page
    .getByLabel('Motivo de archivo o restauración')
    .fill('Restauración sintética autorizada');
  await page.getByRole('button', { name: 'Confirmar estado del predio' }).click();
  await expect(page.getByRole('button', { name: 'Archivar predio', exact: true })).toBeVisible();
  const detail = await (await page.request.get(`/api/gestion/predios/${p.id}`)).json();
  expect(detail.predio.archivado).toBe(false);
  expect(detail.historial.some((h: { accion: string }) => h.accion === 'predio.archivado')).toBe(
    true,
  );
  expect(detail.historial.some((h: { accion: string }) => h.accion === 'predio.restaurado')).toBe(
    true,
  );
  await page.screenshot({ path: `artifacts/screenshots/archivo-${info.project.name}.png` });
});

// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('unidades administrativas persistentes, edición versionada y aislamiento por predio', async ({
  page,
}) => {
  await requireFixtureTarget(page.request, admin);
  await page.request.post('/api/gestion/sesion', { headers, data: admin });
  const code = 'TEST-UNIT-' + randomUUID().slice(0, 8).toUpperCase();
  const p = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code, direccion: 'Predio sintético de varias unidades' },
    })
  ).json();
  await page.goto(`/bagua-master?predio=${p.id}&trabajo=gestion`);
  await page.getByRole('tab', { name: 'Unidades', exact: true }).click();
  await page.getByLabel('Código de unidad').fill('U-01');
  await page.getByLabel('Nombre de unidad').fill('Local ficticio A');
  await page
    .getByLabel('Evidencia de unidad')
    .fill('Subdivisión sintética documentada para ensayo');
  await page.getByRole('button', { name: 'Guardar unidad', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Unidad guardada');
  await page.reload();
  await page.getByRole('tab', { name: 'Unidades', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Local ficticio A');
  const units = await (await page.request.get(`/api/gestion/predios/${p.id}/unidades`)).json();
  expect(units.items).toHaveLength(1);
  const u = units.items[0];
  const body = {
    nombre: 'Local ficticio corregido',
    evidencia: u.evidencia,
    activa: false,
    version: u.version,
  };
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${p.id}/unidades/${u.id}`, {
        headers,
        data: body,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/gestion/predios/${p.id}/unidades/${u.id}`, {
        headers,
        data: body,
      })
    ).status(),
  ).toBe(409);
  expect(
    (await (await page.request.get(`/api/gestion/predios/${p.id}/unidades`)).json()).items[0]
      .activa,
  ).toBe(false);
});
