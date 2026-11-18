import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

function credentials(name: string) {
  const value = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return {
    usuario: value.match(/^Usuario: (.+)$/m)![1],
    password: value.match(/^Contraseña: (.+)$/m)![1],
  };
}
// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('auditoría integrada conserva el mapa y limita datos por permiso', async ({ page }) => {
  const headers = { 'X-Bagua-Request': '1' };
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const response = await page.request.get('/api/gestion/auditoria?limite=1');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items[0]).not.toHaveProperty('anterior');
  expect(body.items[0]).not.toHaveProperty('nuevo');
  expect((await page.request.get('/api/gestion/auditoria?limite=101')).status()).toBe(400);
  expect(
    (await page.request.get('/api/gestion/auditoria?antes=9999999999999999999')).status(),
  ).toBe(400);
  await page.goto('/bagua-master');
  await page.getByRole('button', { name: 'Abrir herramientas' }).click();
  await page.getByRole('menuitem', { name: 'Auditoría de operaciones' }).click();
  await expect(page.getByRole('heading', { name: 'Auditoría de operaciones' })).toBeVisible();
  await expect(page.getByTestId('bagua-master-map')).toBeAttached();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Más antiguas' }).click();
  await expect(page.getByText('Página 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Más recientes' }).click();
  await expect(page.getByText('Página 1', { exact: true })).toBeVisible();
  await page.getByLabel('Acción exacta').fill('no.existe.ensayo');
  await page.getByRole('button', { name: 'Filtrar auditoría' }).click();
  await expect(page.getByText('No hay operaciones que coincidan con este filtro.')).toBeVisible();
  for (const role of ['registro-bagua', 'consulta-bagua']) {
    await page.request.post('/api/gestion/sesion', { headers, data: credentials(role) });
    expect((await page.request.get('/api/gestion/auditoria')).status()).toBe(403);
  }
  await page.request.post('/api/gestion/salir', { headers, data: {} });
  expect((await page.request.get('/api/gestion/auditoria')).status()).toBe(401);
});
