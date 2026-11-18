import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requireFixtureTarget } from './helpers/fixture-target';
function credentials(name: string) {
  const s = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return { usuario: s.match(/^Usuario: (.+)$/m)![1], password: s.match(/^Contraseña: (.+)$/m)![1] };
}
const headers = { 'X-Bagua-Request': '1' };
test('reversión selectiva conserva historia, protege dependencias y es atómica e idempotente', async ({
  page,
}, info) => {
  await requireFixtureTarget(page.request, credentials('admin-bagua'));
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const code = 'TEST-REV-' + randomUUID().slice(0, 8).toUpperCase();
  const p = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code, direccion: 'Dirección local sintética', sector: 'Sector local' },
    })
  ).json();
  const batch = await (
    await page.request.post('/api/gestion/importaciones/validar', {
      headers,
      data: {
        version: 1,
        sintetico: true,
        predios: [
          { codigo: code, direccion: 'Dirección importada sintética', sector: 'Sector importado' },
          { codigo: code + '-A', direccion: 'Alta sintética reversible' },
          { codigo: code + '-B', direccion: 'Alta con dependencias sintéticas' },
        ],
      },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/gestion/importaciones/${batch.id}/aplicar`, {
        headers,
        data: {
          resoluciones: [
            {
              codigo: code,
              accion: 'actualizar',
              version: p.version,
              campos: ['direccion', 'sector'],
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  const path = `/api/gestion/importaciones/${batch.id}`;
  const manifest = await (await page.request.get(path + '/cambios')).json();
  expect(manifest.items).toHaveLength(3);
  const updated = manifest.items.find((r: { codigo: string }) => r.codigo === code),
    first = manifest.items.find((r: { codigo: string }) => r.codigo === code + '-A'),
    dependent = manifest.items.find((r: { codigo: string }) => r.codigo === code + '-B');
  expect(updated.campos).toEqual(['direccion', 'sector']);
  await page.goto('/bagua-master?trabajo=gestion&vista=importaciones');
  await page.getByText('Consultar lotes y revertir cambios', { exact: true }).click();
  await page.getByLabel('Lote a revisar').selectOption(batch.id);
  await page.getByRole('checkbox', { name: `Revertir ${code} direccion`, exact: true }).check();
  await page.getByRole('checkbox', { name: `Revertir ${code}-A alta`, exact: true }).check();
  await page.getByRole('button', { name: 'Previsualizar reversión', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vista previa de reversión' })).toContainText(
    'Archivar el alta',
  );
  await page
    .getByLabel('Motivo de reversión')
    .fill('Ensayo de reversión selectiva de datos sintéticos');
  await page.getByRole('button', { name: 'Aplicar reversión seleccionada' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reversión guardada' })).toBeVisible();
  const detail = await (await page.request.get(`/api/gestion/predios/${p.id}`)).json();
  expect(detail.predio.direccion).toBe('Dirección local sintética');
  expect(detail.predio.sector).toBe('Sector importado');
  expect(
    (await (await page.request.get(`/api/gestion/predios/${first.predio_id}`)).json()).predio
      .archivado,
  ).toBe(true);
  expect(
    detail.historial.some((h: { accion: string }) => h.accion === 'importacion.revertida'),
  ).toBe(true);
  await page.screenshot({ path: `artifacts/screenshots/reversion-${info.project.name}.png` });
  await page.request.post(`/api/gestion/predios/${dependent.predio_id}/unidades`, {
    headers,
    data: {
      codigo: 'U-01',
      nombre: 'Unidad posterior',
      tipo: 'unidad',
      evidencia: 'Subdivisión sintética posterior',
    },
  });
  const body = {
    clave: randomUUID(),
    motivo: 'Reversión transaccional sintética',
    cambios: [
      { id: updated.id, version: detail.predio.version, campos: ['sector'] },
      { id: dependent.id, version: dependent.version, campos: ['alta'] },
    ],
  };
  expect((await page.request.post(path + '/revertir', { headers, data: body })).status()).toBe(409);
  expect(
    (await (await page.request.get(`/api/gestion/predios/${p.id}`)).json()).predio.sector,
  ).toBe('Sector importado');
  const single = { ...body, cambios: [body.cambios[0]] };
  expect((await page.request.post(path + '/revertir', { headers, data: single })).status()).toBe(
    200,
  );
  expect(
    (await (await page.request.post(path + '/revertir', { headers, data: single })).json())
      .repetida,
  ).toBe(true);
  expect(
    (
      await page.request.post(path + '/revertir', {
        headers,
        data: { ...single, motivo: 'Otra solicitud con clave repetida' },
      })
    ).status(),
  ).toBe(409);
  // A later local edit protects the imported alta even if its values were not changed by the import UI.
  const another = await (
    await page.request.post('/api/gestion/importaciones/validar', {
      headers,
      data: {
        version: 1,
        sintetico: true,
        predios: [{ codigo: code + '-C', direccion: 'Alta sintética para conflicto' }],
      },
    })
  ).json();
  await page.request.post(`/api/gestion/importaciones/${another.id}/aplicar`, {
    headers,
    data: {},
  });
  const last = (
    await (await page.request.get(`/api/gestion/importaciones/${another.id}/cambios`)).json()
  ).items[0];
  await page.request.put(`/api/gestion/predios/${last.predio_id}`, {
    headers,
    data: {
      version: last.version,
      datos: { codigo: code + '-C', direccion: 'Edición local posterior protegida' },
    },
  });
  expect(
    (
      await page.request.post(`/api/gestion/importaciones/${another.id}/revertir`, {
        headers,
        data: {
          clave: randomUUID(),
          motivo: 'No debe sobrescribir edición local',
          cambios: [{ id: last.id, version: last.version, campos: ['alta'] }],
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await (await page.request.get(`/api/gestion/importaciones/${another.id}/cambios`)).json())
      .items[0].bloqueo,
  ).toContain('modificaciones posteriores');
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('consulta-bagua') });
  expect((await page.request.get(path + '/cambios')).status()).toBe(403);
  expect((await page.request.post(path + '/revertir', { headers, data: single })).status()).toBe(
    403,
  );
});
