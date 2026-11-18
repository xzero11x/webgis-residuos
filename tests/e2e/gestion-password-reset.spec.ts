import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireFixtureTarget } from './helpers/fixture-target';
function credentials(name: string) {
  const value = readFileSync(`artifacts/accesos-locales/${name}.txt`, 'utf8');
  return {
    usuario: value.match(/^Usuario: (.+)$/m)![1],
    password: value.match(/^Contraseña: (.+)$/m)![1],
  };
}
test('recuperación administrativa revoca sesiones y protege versión y permisos', async ({
  page,
  playwright,
  baseURL,
}) => {
  const admin = credentials('admin-bagua'),
    headers = { 'X-Bagua-Request': '1' };
  await requireFixtureTarget(page.request, admin);
  await page.request.post('/api/gestion/sesion', { headers, data: admin });
  const usuario = 'test_reset_' + randomUUID().slice(0, 8),
    initial = randomUUID(),
    replacement = randomUUID();
  const created = await page.request.post('/api/gestion/usuarios', {
    headers,
    data: { usuario, nombre: 'Cuenta sintética recuperación', rol: 'consulta', password: initial },
  });
  expect(created.status()).toBe(201);
  const account = await created.json();
  const other = await playwright.request.newContext({ baseURL });
  expect(
    (
      await other.post('/api/gestion/sesion', { headers, data: { usuario, password: initial } })
    ).status(),
  ).toBe(200);
  const endpoint = `/api/gestion/usuarios/${account.id}/password`;
  const data = {
    actualAdministrador: admin.password,
    nueva: replacement,
    motivo: 'Recuperación de acceso sintética de prueba',
    version: account.version,
  };
  expect(
    (
      await page.request.post(endpoint, {
        headers,
        data: { ...data, actualAdministrador: 'incorrecta' },
      })
    ).status(),
  ).toBe(403);
  expect((await other.get('/api/gestion/sesion')).status()).toBe(200);
  await page.goto('/bagua-master?trabajo=gestion&vista=usuarios');
  await page.getByRole('button', { name: `Editar cuenta ${usuario}`, exact: true }).click();
  await page.getByText(`Restablecer contraseña de ${usuario}`, { exact: true }).click();
  await page.getByLabel('Tu contraseña administrativa', { exact: true }).fill(admin.password);
  await page.getByLabel('Nueva contraseña para la cuenta', { exact: true }).fill(replacement);
  await page.getByLabel('Confirmar contraseña para la cuenta', { exact: true }).fill(replacement);
  await page.getByLabel('Motivo del restablecimiento', { exact: true }).fill(data.motivo);
  const response = page.waitForResponse(
    (r) => r.url().endsWith(endpoint) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Restablecer contraseña y revocar sesiones' }).click();
  expect((await response).status()).toBe(204);
  expect((await other.get('/api/gestion/sesion')).status()).toBe(401);
  expect(
    (
      await other.post('/api/gestion/sesion', { headers, data: { usuario, password: initial } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await other.post('/api/gestion/sesion', { headers, data: { usuario, password: replacement } })
    ).status(),
  ).toBe(200);
  expect((await other.post(endpoint, { headers, data })).status()).toBe(403);
  expect((await page.request.post(endpoint, { headers, data })).status()).toBe(409);
  const history = await (
    await page.request.get('/api/gestion/auditoria?accion=usuario.password_restablecida')
  ).json();
  expect(history.items.length).toBeGreaterThan(0);
  await other.dispose();
});
