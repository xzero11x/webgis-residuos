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
const headers = { 'X-Bagua-Request': '1' };
test.setTimeout(30000);
test.beforeEach(async ({ request }) => {
  await requireFixtureTarget(request, credentials('admin-bagua'));
});
test('archivo CSV, columnas, revisión, persistencia, idempotencia y conflicto visible', async ({
  page,
}, info) => {
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const code = `TEST-CSV-${randomUUID().slice(0, 8)}`;
  await page.goto('/bagua-master?trabajo=gestion&vista=importaciones');
  await page.getByLabel('Archivo CSV de prueba').setInputFiles({
    name: 'padron-prueba.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `CLAVE;DOMICILIO;ZONA\n${code};"Dirección ficticia; de ensayo";Sector sintético CSV\n`,
    ),
  });
  await page.getByLabel('Columna para Código de origen').selectOption('CLAVE');
  await page.getByLabel('Columna para Dirección', { exact: true }).selectOption('DOMICILIO');
  await page.getByLabel('Columna para Sector', { exact: true }).selectOption('ZONA');
  await page
    .getByRole('checkbox', {
      name: 'Confirmo que contiene únicamente datos de prueba no oficiales',
    })
    .check();
  await page.getByRole('button', { name: 'Validar archivo y mapeo' }).click();
  await expect(page.getByRole('table', { name: 'Revisión antes de aplicar' })).toContainText(
    'Nuevo registro',
  );
  await page.getByRole('button', { name: 'Aplicar lote validado' }).click();
  await expect(page.getByRole('status')).toContainText('1 nuevos');
  const found = await (await page.request.get(`/api/gestion/predios?q=${code}`)).json();
  expect(found.total).toBe(1);
  expect(found.items[0].ubicacion).toBeNull();
  await page.getByRole('button', { name: 'Validar archivo y mapeo' }).click();
  await expect(page.getByRole('table')).toContainText('Sin cambios');
  await page.getByRole('button', { name: 'Aplicar lote validado' }).click();
  await expect(page.getByRole('status')).toContainText('ya estaba aplicado');
  await page.getByLabel('Archivo CSV de prueba').setInputFiles({
    name: 'conflicto.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`CLAVE;DOMICILIO\n${code};Otra dirección ficticia\n`),
  });
  await page.getByLabel('Columna para Código de origen').selectOption('CLAVE');
  await page.getByLabel('Columna para Dirección', { exact: true }).selectOption('DOMICILIO');
  await page
    .getByRole('checkbox', {
      name: 'Confirmo que contiene únicamente datos de prueba no oficiales',
    })
    .check();
  await page.getByRole('button', { name: 'Validar archivo y mapeo' }).click();
  await expect(page.getByRole('alert')).toContainText('Hay conflictos');
  await expect(page.getByRole('button', { name: 'Aplicar lote validado' })).toBeDisabled();
  await page.screenshot({
    path: `artifacts/screenshots/mision-importacion-${info.project.name}.png`,
  });
});

test('reporte filtrado, exportación y permisos usan eventos almacenados', async ({
  page,
}, info) => {
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const code = `TEST-REP-${randomUUID().slice(0, 8)}`,
    sector = `Sector sintético ${code}`;
  const predio = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: code, direccion: 'Dirección sintética', sector },
    })
  ).json();
  const catalog = await (await page.request.get('/api/gestion/catalogos')).json();
  const participation = await (
    await page.request.post(`/api/gestion/predios/${predio.id}/participaciones`, {
      headers,
      data: {
        servicioId: catalog.servicios[0].id,
        periodo: { desde: '2026-01-01', hasta: null, evidencia: 'Ensayo sintético' },
      },
    })
  ).json();
  const material = `Material de ensayo ${code}`;
  for (const cantidad of [null, 2.5]) {
    const r = await page.request.post('/api/gestion/entregas', {
      headers,
      data: {
        participacionId: participation.id,
        fecha: '2026-01-02',
        material,
        cantidad,
        unidad: cantidad === null ? null : 'kg',
        clave: randomUUID(),
      },
    });
    expect(r.status()).toBe(201);
  }
  await page.goto('/bagua-master?trabajo=gestion&vista=reportes');
  await page.getByLabel('Desde', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-01-31');
  await page.getByLabel('Sector del reporte').fill(sector);
  await page.getByLabel('Material del reporte').fill(material);
  await page.getByLabel('Servicio del reporte').selectOption(catalog.servicios[0].id);
  await page.getByRole('button', { name: 'Consultar reporte' }).click();
  await expect(page.getByRole('table')).toContainText(material);
  await expect(page.getByRole('table')).toContainText(/2[.,]5 kg/);
  await expect(page.getByRole('table')).toContainText('Sin información');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar reporte CSV' }).click();
  const saved = await download;
  const file = await saved.path();
  const csv = readFileSync(file!, 'utf8');
  expect(csv).toContain('SINTETICO-LOCAL-V1');
  expect(csv).toContain('"2.5"');
  expect(csv).not.toContain('PERSONA');
  expect(csv).toContain(sector);
  await page.screenshot({ path: `artifacts/screenshots/mision-reporte-${info.project.name}.png` });
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('consulta-bagua') });
  const filter = new URLSearchParams({
    desde: '2026-01-01',
    hasta: '2026-01-31',
    sector,
    material,
  });
  expect((await page.request.get(`/api/gestion/reportes?${filter}`)).status()).toBe(200);
  expect((await page.request.get(`/api/gestion/reportes/exportar?${filter}`)).status()).toBe(403);
  expect(
    (
      await page.request.post('/api/gestion/importaciones/columnas', {
        headers,
        data: { contenido: 'A;B\n1;2', separador: ';' },
      })
    ).status(),
  ).toBe(403);
});

// PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
// espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
// docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
test.fixme('variantes de archivo y personas con varios vínculos protegidos', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'API independiente del tamaño.');
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const code = `TEST-PER-${randomUUID().slice(0, 8)}`;
  const base = {
    formato: 'csv',
    version: 1,
    sintetico: true,
    nombre: 'variante.csv',
    contenido: `ref,domicilio\n${code},Dirección de prueba`,
    separador: ',',
    mapeo: { codigo: 'ref', direccion: 'domicilio' },
  };
  const validated = await page.request.post('/api/gestion/importaciones/validar', {
    headers,
    data: base,
  });
  expect(validated.ok()).toBe(true);
  const batch = await validated.json();
  expect(
    (
      await page.request.post(`/api/gestion/importaciones/${batch.id}/aplicar`, {
        headers,
        data: {},
      })
    ).ok(),
  ).toBe(true);
  for (const invalid of [
    { ...base, contenido: `ref,domicilio\n${code},A\n${code},B` },
    { ...base, mapeo: { codigo: 'inexistente', direccion: 'domicilio' } },
    { ...base, contenido: 'ref,domicilio\n"Sin cierre' },
    { ...base, sintetico: false },
    { ...base, contenido: `ref,domicilio\n${code},` },
  ])
    expect(
      (
        await page.request.post('/api/gestion/importaciones/validar', { headers, data: invalid })
      ).status(),
    ).toBe(400);
  const person = await (
    await page.request.post('/api/gestion/personas', {
      headers,
      data: { codigo: `${code}-P`, nombre: `PERSONA FICTICIA ${code}`, tipo: 'natural' },
    })
  ).json();
  const first = (await (await page.request.get(`/api/gestion/predios?q=${code}`)).json()).items[0];
  const second = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: `${code}-2`, direccion: 'Otra referencia sintética' },
    })
  ).json();
  for (const [record, type] of [
    [first, 'contribuyente'],
    [second, 'ocupante'],
  ] as const) {
    expect(
      (
        await page.request.post(`/api/gestion/predios/${record.id}/vinculos`, {
          headers,
          data: {
            personaId: person.id,
            tipo: type,
            periodo: {
              desde: '2026-01-01',
              hasta: null,
              evidencia: 'Vínculo sintético expresamente registrado',
            },
          },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto('/bagua-master');
  await page.getByRole('searchbox').fill(person.codigo);
  await page.getByRole('button', { name: new RegExp(person.nombre) }).click();
  const panel = page.getByRole('complementary', { name: 'Persona y vínculos autorizados' });
  await expect(panel).toContainText('contribuyente');
  await expect(panel).toContainText('ocupante');
  await panel
    .getByRole('button', { name: `Consultar predio ${first.codigo}`, exact: true })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'Ficha contextual del predio' }),
  ).toContainText(first.codigo);
  await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('consulta-bagua') });
  expect((await page.request.get(`/api/gestion/personas/${person.id}/predios`)).status()).toBe(403);
  await page.reload();
  await page.getByRole('searchbox').fill(person.codigo);
  await expect(page.getByRole('region', { name: 'Personas autorizadas' })).toHaveCount(0);
});

test('catálogos configurables conservan historia y bloquean nuevas asignaciones inactivas', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'tablet', 'Se verifica en escritorio y móvil.');
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const code = `TEST-CAT-${randomUUID().slice(0, 8).toUpperCase()}`;
  await page.goto('/bagua-master?trabajo=gestion&vista=catalogos');
  await page.getByLabel('Código del catálogo').fill(code);
  await page.getByLabel('Nombre de prueba').fill(`Servicio sintético ${code}`);
  await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Catálogo actualizado');
  const catalog = await (await page.request.get('/api/gestion/catalogos/configuracion')).json();
  const service = catalog.servicios.find((item: { codigo: string }) => item.codigo === code);
  expect(service).toBeTruthy();
  const predio = await (
    await page.request.post('/api/gestion/predios', {
      headers,
      data: { codigo: `${code}-P`, direccion: 'Predio sintético de catálogo' },
    })
  ).json();
  const assignment = {
    servicioId: service.id,
    periodo: { desde: '2026-01-01', hasta: null, evidencia: 'Ensayo sintético de catálogo' },
  };
  expect(
    (
      await page.request.post(`/api/gestion/predios/${predio.id}/asignaciones`, {
        headers,
        data: assignment,
      })
    ).status(),
  ).toBe(201);
  page.once('dialog', (native) => native.accept());
  await page.getByRole('button', { name: `Desactivar ${code}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Activar ${code}`, exact: true })).toBeVisible();
  expect(
    (
      await page.request.post(`/api/gestion/predios/${predio.id}/participaciones`, {
        headers,
        data: assignment,
      })
    ).status(),
  ).toBe(400);
  const detail = await (await page.request.get(`/api/gestion/predios/${predio.id}`)).json();
  expect(detail.asignaciones).toHaveLength(1);
  await page.getByLabel('Tipo de catálogo').selectOption('materiales');
  await page.getByLabel('Código del catálogo').fill(`${code}-M`);
  await page.getByLabel('Nombre de prueba').fill(`Material sintético ${code}`);
  await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Catálogo actualizado');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogos de prueba' })).toBeVisible();
  await page.getByLabel('Tipo de catálogo').selectOption('materiales');
  await expect(page.getByRole('list')).toContainText(`Material sintético ${code}`);
  await page.screenshot({
    path: `artifacts/screenshots/mision-catalogos-${info.project.name}.png`,
  });
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('registro-bagua') });
  expect(
    (
      await page.request.post('/api/gestion/catalogos/servicios', {
        headers,
        data: { codigo: `${code}-NO`, nombre: 'No autorizado' },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get('/api/gestion/catalogos/configuracion')).status()).toBe(403);
});

test('cuentas persistentes, versión, revocación y contraseña propia desde la interfaz', async ({
  page,
  playwright,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'tablet', 'Se comprueba en escritorio y móvil.');
  await page.request.post('/api/gestion/sesion', { headers, data: credentials('admin-bagua') });
  const username = `test_${randomUUID().slice(0, 8)}`,
    initial = randomUUID() + '-Initial',
    updated = randomUUID() + '-New';
  await page.goto('/bagua-master?trabajo=gestion&vista=usuarios');
  await page.getByLabel('Usuario nuevo', { exact: true }).fill(username);
  await page.getByLabel('Nombre de prueba de la cuenta').fill('PERSONA FICTICIA CUENTA');
  await page.getByLabel('Perfil técnico').selectOption('registro');
  await page.getByLabel('Contraseña inicial (mínimo 16 caracteres)').fill(initial);
  await page.getByRole('button', { name: 'Guardar cuenta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cuenta guardada');
  const accounts = await (await page.request.get('/api/gestion/usuarios')).json();
  const account = accounts.items.find((item: { usuario: string }) => item.usuario === username);
  expect(account).not.toHaveProperty('password_hash');
  const admin = accounts.items.find(
    (item: { usuario: string }) => item.usuario === credentials('admin-bagua').usuario,
  );
  expect(
    (
      await page.request.patch(`/api/gestion/usuarios/${admin.id}`, {
        headers,
        data: { nombre: admin.nombre, rol: 'consulta', activo: false, version: admin.version },
      })
    ).status(),
  ).toBe(409);
  const context = await playwright.request.newContext({ baseURL });
  expect(
    (
      await context.post('/api/gestion/sesion', {
        headers,
        data: { usuario: username, password: initial },
      })
    ).status(),
  ).toBe(200);
  const update = {
    nombre: account.nombre,
    rol: 'registro',
    activo: false,
    version: account.version,
  };
  expect(
    (
      await page.request.patch(`/api/gestion/usuarios/${account.id}`, { headers, data: update })
    ).status(),
  ).toBe(200);
  expect((await context.get('/api/gestion/sesion')).status()).toBe(401);
  expect(
    (
      await page.request.patch(`/api/gestion/usuarios/${account.id}`, { headers, data: update })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch(`/api/gestion/usuarios/${account.id}`, {
        headers,
        data: { ...update, activo: true, version: account.version + 1 },
      })
    ).status(),
  ).toBe(200);
  await context.dispose();
  await page.request.post('/api/gestion/sesion', {
    headers,
    data: { usuario: username, password: initial },
  });
  await page.goto('/bagua-master?trabajo=gestion&vista=password');
  await page.getByLabel('Contraseña actual', { exact: true }).fill(initial);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(updated);
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(updated);
  await page.getByRole('button', { name: 'Guardar contraseña y cerrar sesiones' }).click();
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/gestion/sesion', {
        headers,
        data: { usuario: username, password: initial },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post('/api/gestion/sesion', {
        headers,
        data: { usuario: username, password: updated },
      })
    ).status(),
  ).toBe(200);
  expect((await page.request.get('/api/gestion/usuarios')).status()).toBe(403);
});
