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
test.fixme('persona y unidad: navegación bidireccional en el mismo mapa y privacidad', async ({
  page,
}, info) => {
  await requireFixtureTarget(page.request, creds('admin-bagua'));
  await page.request.post('/api/gestion/sesion', { headers, data: creds('admin-bagua') });
  const code = 'TEST-PUNIT-' + randomUUID().slice(0, 8).toUpperCase();
  async function create(path: string, data: unknown) {
    const result = await page.request.post('/api/gestion' + path, { headers, data });
    expect(result.status()).toBe(201);
    return result.json();
  }
  const predio = await create('/predios', {
    codigo: code,
    direccion: 'Referencia sintética sin coordenadas',
  });
  const unit = await create(`/predios/${predio.id}/unidades`, {
    codigo: 'S-01',
    nombre: 'Sección de ensayo',
    tipo: 'seccion',
    evidencia: 'Subdivisión ficticia declarada',
  });
  const person = await create('/personas', {
    codigo: code + '-P',
    nombre: 'PERSONA FICTICIA ' + code,
    tipo: 'natural',
  });
  const relation = await create(`/predios/${predio.id}/unidades/${unit.id}/relaciones`, {
    personaId: person.id,
    tipo: 'ocupante',
    periodo: {
      desde: '2026-01-01',
      hasta: '2026-02-01',
      evidencia: 'Relación histórica sintética exclusiva de la sección',
    },
  });
  const data = await (await page.request.get(`/api/gestion/personas/${person.id}/predios`)).json();
  expect(data.vinculos).toEqual([]);
  expect(data.unidades).toHaveLength(1);
  expect(data.unidades[0]).toMatchObject({
    id: relation.id,
    unidad_id: unit.id,
    predio_id: predio.id,
    tipo: 'ocupante',
  });
  await page.goto(`/bagua-master?persona=${person.id}`);
  await expect(page.getByText('Sin vínculos a nivel de predio.', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { keptMap: Element | null }).keptMap =
      document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: `Consultar unidad S-01 del predio ${code}` }).click();
  await expect(page.getByRole('tab', { name: 'Unidades', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator(`#unidad-${unit.id}`)).toBeFocused();
  await page.getByText('Personas y servicios de esta unidad', { exact: true }).click();
  await page.getByRole('link', { name: `Consultar persona ${person.nombre}` }).click();
  await expect(page.getByRole('heading', { name: person.nombre, exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { keptMap: Element | null }).keptMap ===
        document.querySelector('.maplibregl-canvas'),
    ),
  ).toBe(true);
  await page.screenshot({ path: `artifacts/screenshots/persona-unidad-${info.project.name}.png` });
  await page.getByRole('searchbox').fill(code);
  const units = page.getByRole('region', { name: 'Unidades y secciones administrativas' });
  await units.getByRole('button', { name: /S-01/ }).click();
  await expect(page.locator(`#unidad-${unit.id}`)).toBeFocused();
  expect((await page.request.get('/api/gestion/unidades/buscar?q=X')).status()).toBe(400);
  await page.request.post('/api/gestion/sesion', { headers, data: creds('consulta-bagua') });
  const found = await (await page.request.get(`/api/gestion/unidades/buscar?q=${code}`)).json();
  expect(found.items).toHaveLength(1);
  expect(JSON.stringify(found)).not.toContain(person.nombre);
  expect((await page.request.get(`/api/gestion/personas/${person.id}/predios`)).status()).toBe(403);
  const restricted = await (
    await page.request.get(`/api/gestion/predios/${predio.id}/unidades/${unit.id}/relaciones`)
  ).json();
  expect(restricted.items).toEqual([]);
});
