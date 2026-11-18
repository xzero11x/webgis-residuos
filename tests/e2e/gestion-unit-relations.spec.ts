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
test.fixme('relaciones específicas de unidad: UI, periodos, privacidad e integridad', async ({
  page,
}, info) => {
  await requireFixtureTarget(page.request, creds('admin-bagua'));
  await page.request.post('/api/gestion/sesion', { headers, data: creds('admin-bagua') });
  const code = 'TEST-UREL-' + randomUUID().slice(0, 8).toUpperCase();
  const parent = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code, direccion: 'Referencia ficticia con varias unidades' },
    })
  ).json();
  const other = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code + '-B', direccion: 'Otra referencia ficticia' },
    })
  ).json();
  const unit = await (
    await page.request.post(`/api/gestion/predios/${parent.id}/unidades`, {
      headers,
      data: {
        codigo: 'U-01',
        nombre: 'Unidad ficticia para relaciones',
        tipo: 'unidad',
        evidencia: 'Documento ficticio de subdivisión',
      },
    })
  ).json();
  const person = await (
    await page.request.post('/api/gestion/personas', {
      headers,
      data: { codigo: code + '-PERSON', nombre: 'PERSONA FICTICIA ' + code, tipo: 'natural' },
    })
  ).json();
  const route = `/api/gestion/predios/${parent.id}/unidades/${unit.id}/relaciones`;
  const period = {
    desde: '2026-01-01',
    hasta: null,
    evidencia: 'Asignación explícita de ensayo a unidad; sin migración del predio',
  };
  await page.request.post(`/api/gestion/predios/${parent.id}/vinculos`, {
    headers,
    data: { personaId: person.id, tipo: 'contribuyente', periodo: period },
  });
  expect((await (await page.request.get(route)).json()).items).toEqual([]);
  await page.goto(`/bagua-master?predio=${parent.id}&trabajo=gestion`);
  await page.getByRole('tab', { name: 'Unidades', exact: true }).click();
  await page.getByText('Personas y servicios de esta unidad', { exact: true }).click();
  await page.getByLabel('Buscar persona para esta unidad').fill(person.codigo);
  await page.getByLabel('Referencia de unidad', { exact: true }).selectOption(person.id);
  await page.getByLabel('Tipo de vínculo de unidad').selectOption('ocupante');
  await page.getByLabel('Desde en unidad', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Evidencia de relación de unidad').fill(period.evidencia);
  await page.getByRole('button', { name: 'Guardar relación de unidad', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Relación de unidad guardada');
  const body = { personaId: person.id, tipo: 'ocupante', periodo: period };
  expect((await page.request.post(route, { headers, data: body })).status()).toBe(400);
  expect(
    (
      await page.request.post(route, { headers, data: { ...body, personaId: randomUUID() } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(route, {
        headers,
        data: { ...body, periodo: { ...period, hasta: '2025-12-31' } },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await page.request.post(route.replace(parent.id, other.id), { headers, data: body })).status(),
  ).toBe(404);
  const catalog = await (await page.request.get('/api/gestion/catalogos')).json();
  const service = {
    servicioId: catalog.servicios[0].id,
    tipo: 'servicio',
    estado: 'pendiente',
    periodo: period,
  };
  expect((await page.request.post(route, { headers, data: service })).status()).toBe(201);
  const rows = await (await page.request.get(route)).json();
  expect(rows.items).toHaveLength(2);
  const relation = rows.items.find((r: { tipo: string }) => r.tipo === 'ocupante');
  expect(
    (
      await page.request.post(`${route}/${relation.id}/cerrar`, {
        headers,
        data: {
          hasta: '2026-02-01',
          version: relation.version,
          motivo: 'Fin documentado de prueba',
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`${route}/${relation.id}/cerrar`, {
        headers,
        data: {
          hasta: '2026-02-01',
          version: relation.version,
          motivo: 'Repetición desactualizada',
        },
      })
    ).status(),
  ).toBe(409);
  await page.request.post(`/api/gestion/predios/${parent.id}/archivo`, {
    headers,
    data: { archivado: true, version: 1, motivo: 'Archivo de ensayo conservando relaciones' },
  });
  expect(
    (await page.request.post(route, { headers, data: { ...body, tipo: 'responsable' } })).status(),
  ).toBe(400);
  await page.request.post(`/api/gestion/predios/${parent.id}/archivo`, {
    headers,
    data: { archivado: false, version: 2, motivo: 'Restauración de ensayo manteniendo relaciones' },
  });
  expect((await (await page.request.get(route)).json()).items).toHaveLength(2);
  expect(
    (await (await page.request.get(`/api/gestion/predios/${parent.id}`)).json()).personas,
  ).toHaveLength(1);
  await page.screenshot({
    path: `artifacts/screenshots/unidad-relaciones-${info.project.name}.png`,
  });
  await page.request.post('/api/gestion/sesion', { headers, data: creds('consulta-bagua') });
  const restricted = await (await page.request.get(route)).json();
  expect(restricted.personasPermitidas).toBe(false);
  expect(restricted.items).toHaveLength(1);
  expect(restricted.items[0]).not.toHaveProperty('persona');
  expect((await page.request.post(route, { headers, data: body })).status()).toBe(403);
});
