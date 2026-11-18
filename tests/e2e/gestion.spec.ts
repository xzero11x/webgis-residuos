import { requireFixtureTarget } from './helpers/fixture-target';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

function credentials(name: string) {
  const file = path.resolve('artifacts/accesos-locales', `${name}.txt`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  return {
    usuario: text.match(/^Usuario: (.+)$/m)![1]!,
    password: text.match(/^Contraseña: (.+)$/m)![1]!,
  };
}
const admin = credentials('admin-bagua'),
  reader = credentials('consulta-bagua'),
  registrar = credentials('registro-bagua');
const headers = { 'X-Bagua-Request': '1' };
const date = '2026-01-01';
const period = { desde: date, hasta: null, evidencia: 'Ensayo sintético E2E' };
async function post(request: APIRequestContext, url: string, data: unknown) {
  return request.post(`/api/gestion${url}`, { data, headers });
}

test.describe('Gestión de BAGUA MASTER con fuente sintética', () => {
  test.skip(
    !admin || !reader,
    'Preparar accesos locales con gestion:usuario antes de estas pruebas.',
  );
  test.beforeEach(async ({ request }) => {
    await requireFixtureTarget(request, admin);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('referencia protegida en Overture, importación revisada y reporte desde la interfaz', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'desktop',
      'El recorrido de registro ya se verifica también en móvil.',
    );
    expect((await post(page.request, '/sesion', admin)).status()).toBe(200);
    const code = `E2E-REF-${Date.now()}`;
    const record = await (
      await post(page.request, '/predios', {
        codigo: code,
        direccion: 'Referencia sintética de ensayo',
        ubicacion: { type: 'Point', coordinates: [-78.5367, -5.6378] },
        estadoUbicacion: 'aproximada',
        evidenciaUbicacion: 'Punto didáctico ficticio; no representa un predio real.',
      })
    ).json();
    const minimal = await (
      await page.request.get(`/api/gestion/predios/${record.id}/referencia`)
    ).json();
    expect(minimal).not.toHaveProperty('personas');
    expect(minimal).not.toHaveProperty('direccion');
    await page.goto(`/bagua-master?predio=${record.id}`);
    await expect(page.getByTestId('bagua-master-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 60000,
    });
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mostrar referencia aproximada' }).click();
    await expect(
      page.locator(`[aria-label="Referencia sintética ${code} · aproximada"]`),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Abrir ficha administrativa' }).click();
    await expect(page.getByRole('article')).toContainText(code);
    await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir herramientas' }).click();
    await page.getByRole('menuitem', { name: 'Importaciones', exact: true }).click();
    await page.getByLabel('Formato de importación').selectOption('json');
    await page.getByLabel('Lote JSON').fill(
      JSON.stringify({
        version: 1,
        sintetico: true,
        predios: [{ codigo: `${code}-IMPORT`, direccion: 'Ensayo de importación desde interfaz' }],
      }),
    );
    await page.getByRole('button', { name: 'Validar lote', exact: true }).click();
    await expect(page.getByText('1 registros válidos.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Aplicar lote validado' }).click();
    await expect(page.getByRole('status')).toContainText('Importación aplicada: 1 nuevos');
    await page.getByRole('link', { name: 'Reportes', exact: true }).click();
    await page.getByRole('button', { name: 'Consultar reporte' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table')).toContainText('Sin información');
    const outside = await (
      await post(page.request, '/predios', {
        codigo: `${code}-FUERA`,
        direccion: 'Referencia sintética fuera del recorte urbano',
        ubicacion: { type: 'Point', coordinates: [-77, -6] },
        estadoUbicacion: 'aproximada',
        evidenciaUbicacion: 'Ensayo de referencia fuera de ámbito.',
      })
    ).json();
    await page.goto(`/bagua-master?predio=${outside.id}`);
    await expect(
      page.getByRole('complementary', { name: 'Ficha contextual del predio' }),
    ).toContainText('fuera del ámbito urbano');
    await expect(page.locator('.bm-predio-marker')).toHaveCount(0);
  });
  // PENDIENTE: este caso recorre el espacio de trabajo dentro del mapa, retirado al pasar a
  // espacios propios (Explorar, Expedientes, Servicios, Resultados). Migrar al flujo nuevo; ver
  // docs/avance-verificado.md. El recorrido vigente está en bagua-recorrido-aceptacion.spec.ts.
  test.fixme('padrón, ficha sin geometría, persona, participación y entrega desde la interfaz', async ({
    page,
  }, info) => {
    const code = `E2E-${info.project.name.toUpperCase()}-${Date.now()}`;
    await page.goto('/bagua-master/gestion');
    await page.getByLabel('Usuario', { exact: true }).fill(admin!.usuario);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin!.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Gestión territorial y operativa' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Nuevo predio', exact: true }).click();
    await page.getByLabel('Código de origen', { exact: true }).fill(code);
    await page
      .getByLabel('Dirección', { exact: true })
      .fill('Dirección sintética E2E de BAGUA MASTER');
    await page.getByRole('button', { name: 'Guardar predio', exact: true }).click();
    const detail = page.getByRole('article', { name: 'Ficha administrativa del predio' });
    await expect(detail).toContainText(code);
    await expect(detail).toContainText(
      'Pendiente. La ficha existe aunque todavía no haya coordenadas.',
    );
    await page.getByRole('button', { name: 'Editar predio', exact: true }).click();
    await page.getByLabel('Sector', { exact: true }).fill('Sector de ensayo corregido');
    await page.getByRole('button', { name: 'Guardar predio', exact: true }).click();
    await expect(detail).toContainText('Sector de ensayo corregido');
    await page.getByRole('tab', { name: 'Personas', exact: true }).click();
    await page.getByRole('button', { name: 'Vincular persona', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Crear una persona de prueba' }).check();
    await page.getByLabel('Código de persona', { exact: true }).fill(`${code}-P`);
    await page
      .getByLabel('Nombre sintético', { exact: true })
      .fill('Persona ficticia de ensayo E2E');
    await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    await expect(detail).toContainText('Persona ficticia de ensayo E2E');
    await page.getByRole('tab', { name: 'Entregas', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar participación', exact: true }).click();
    await page
      .getByLabel('Servicio de prueba', { exact: true })
      .selectOption({ label: 'Orgánicos · catálogo de prueba' });
    await page.getByLabel('Desde', { exact: true }).fill(date);
    await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar entrega', exact: true }).click();
    await page.getByLabel('Participación', { exact: true }).selectOption({ index: 1 });
    await page
      .getByLabel('Material registrado', { exact: true })
      .fill(`Material sintético ${code}`);
    await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    await expect(detail).toContainText(`Material sintético ${code}`);
    await expect(detail).toContainText('Cantidad sin información');
    await page.reload();
    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await expect(detail).toContainText('Entrega registrada');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `artifacts/screenshots/gestion-${info.project.name}.png`,
      fullPage: true,
    });
  });

  test('API: permisos, versiones, vínculos múltiples e importación atómica', async ({
    playwright,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'Integridad independiente del tamaño de pantalla.');
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.get('/api/gestion/predios')).status()).toBe(401);
    expect((await anonymous.post('/api/gestion/sesion', { data: admin })).status()).toBe(403);
    const writer = await playwright.request.newContext({ baseURL });
    expect((await post(writer, '/sesion', admin)).status()).toBe(200);
    const viewer = await playwright.request.newContext({ baseURL });
    expect((await post(viewer, '/sesion', reader)).status()).toBe(200);
    if (registrar) {
      const operator = await playwright.request.newContext({ baseURL });
      expect((await post(operator, '/sesion', registrar)).status()).toBe(200);
      expect((await operator.get('/api/gestion/personas')).status()).toBe(200);
      expect(
        (
          await post(operator, '/importaciones/validar', {
            version: 1,
            sintetico: true,
            predios: [{ codigo: 'E2E-NOT-IMPORTED', direccion: 'No debe importar este perfil' }],
          })
        ).status(),
      ).toBe(403);
      await operator.dispose();
    }
    const code = `E2E-API-${Date.now()}`,
      input = { codigo: code, direccion: 'Registro sintético API', sector: 'Sector de ensayo' };
    const first = await post(writer, '/predios', input);
    expect(first.status()).toBe(201);
    const predio = await first.json();
    expect(predio.ubicacion).toBeNull();
    expect((await post(viewer, '/predios', input)).status()).toBe(403);
    expect((await viewer.get('/api/gestion/personas')).status()).toBe(403);
    const current = (await (await writer.get(`/api/gestion/predios/${predio.id}`)).json()).predio;
    const update = { ...input, direccion: 'Dirección sintética corregida' };
    expect(
      (
        await writer.put(`/api/gestion/predios/${predio.id}`, {
          headers,
          data: { datos: update, version: current.version },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await writer.put(`/api/gestion/predios/${predio.id}`, {
          headers,
          data: { datos: input, version: current.version },
        })
      ).status(),
    ).toBe(409);
    const person = await (
      await post(writer, '/personas', {
        codigo: `${code}-P`,
        nombre: 'Persona sintética compartida',
        tipo: 'natural',
      })
    ).json();
    const second = await (
      await post(writer, '/predios', { codigo: `${code}-B`, direccion: 'Otro registro sintético' })
    ).json();
    for (const id of [predio.id, second.id])
      expect(
        (
          await post(writer, `/predios/${id}/vinculos`, {
            personaId: person.id,
            tipo: 'contribuyente',
            periodo: period,
          })
        ).status(),
      ).toBe(201);
    const limited = await (await viewer.get(`/api/gestion/predios/${predio.id}`)).json();
    expect(limited.personas).toEqual([]);
    expect(limited.historial).toEqual([]);
    expect(limited.personasPermitidas).toBe(false);
    const preview = await (
      await post(writer, '/importaciones/validar', {
        version: 1,
        sintetico: true,
        predios: [{ codigo: `${code}-IMPORT`, direccion: 'Alta que debe revertirse' }, input],
      })
    ).json();
    expect((await post(writer, `/importaciones/${preview.id}/aplicar`, {})).status()).toBe(409);
    expect((await (await writer.get(`/api/gestion/predios?q=${code}-IMPORT`)).json()).total).toBe(
      0,
    );
    const correct = await (
      await post(writer, '/importaciones/validar', {
        version: 1,
        sintetico: true,
        predios: [{ codigo: `${code}-IMPORT`, direccion: 'Alta sintética válida' }],
      })
    ).json();
    expect(
      (await (await post(writer, `/importaciones/${correct.id}/aplicar`, {})).json()).creados,
    ).toBe(1);
    expect(
      (await (await post(writer, `/importaciones/${correct.id}/aplicar`, {})).json()).repetida,
    ).toBe(true);
    expect(
      (
        await post(writer, '/importaciones/validar', {
          version: 1,
          sintetico: false,
          predios: [input],
        })
      ).status(),
    ).toBe(400);
    const badPersonCode = `${code}-ROLLBACK`;
    expect(
      (
        await post(writer, `/predios/${randomUUID()}/vinculos`, {
          persona: {
            codigo: badPersonCode,
            nombre: 'Persona que debe revertirse',
            tipo: 'natural',
          },
          tipo: 'ocupante',
          periodo: period,
        })
      ).status(),
    ).toBe(400);
    expect(
      (await (await writer.get(`/api/gestion/personas?q=${badPersonCode}`)).json()).items,
    ).toHaveLength(0);
    expect((await post(writer, '/salir', {})).status()).toBe(204);
    expect((await writer.get('/api/gestion/predios')).status()).toBe(401);
    await anonymous.dispose();
    await viewer.dispose();
    await writer.dispose();
  });

  test('API: entregas sin duplicación, mediciones separadas y anulación trazable', async ({
    playwright,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'Integridad independiente del tamaño de pantalla.');
    const request = await playwright.request.newContext({ baseURL });
    await post(request, '/sesion', admin);
    const code = `E2E-EVENT-${Date.now()}`,
      material = `Material de ensayo ${code}`;
    const predio = await (
      await post(request, '/predios', { codigo: code, direccion: 'Ensayo de eventos' })
    ).json();
    const service = (await (await request.get('/api/gestion/catalogos')).json()).servicios[0].id;
    const part = await (
      await post(request, `/predios/${predio.id}/participaciones`, {
        servicioId: service,
        periodo: period,
      })
    ).json();
    const payload = {
      participacionId: part.id,
      fecha: '2026-11-01',
      material,
      cantidad: 5,
      unidad: 'kg',
      clave: randomUUID(),
    };
    const deliveries = await Promise.all([
      post(request, '/entregas', payload),
      post(request, '/entregas', payload),
    ]);
    for (const response of deliveries) expect(response.status()).toBe(201);
    const first = await deliveries[0]!.json(),
      second = await deliveries[1]!.json();
    expect(first.id).toBe(second.id);
    expect((await post(request, '/entregas', { ...payload, cantidad: 10 })).status()).toBe(409);
    expect(
      (
        await post(request, '/entregas', {
          ...payload,
          cantidad: null,
          unidad: 'kg',
          clave: randomUUID(),
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(request, '/entregas', { ...payload, fecha: '2099-01-01', clave: randomUUID() })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(request, '/entregas', {
          ...payload,
          cantidad: null,
          unidad: null,
          clave: randomUUID(),
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await post(request, '/entregas', {
          ...payload,
          cantidad: 2,
          unidad: 'unidad',
          clave: randomUUID(),
        })
      ).status(),
    ).toBe(201);
    const report = await (
      await request.get('/api/gestion/reportes?desde=2026-01-01&hasta=2026-12-31')
    ).json();
    const rows = report.items.filter((r: { material: string }) => r.material === material);
    expect(rows).toHaveLength(3);
    expect(rows.find((r: { unidad: string | null }) => r.unidad === null).cantidad).toBeNull();
    expect(
      (
        await post(request, `/predios/${predio.id}/participaciones/${part.id}/cerrar`, {
          hasta: '2026-10-01',
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await post(request, `/entregas/${first.id}/anular`, { motivo: 'Corrección de ensayo E2E' })
      ).status(),
    ).toBe(200);
    const final = await (await request.get(`/api/gestion/predios/${predio.id}`)).json();
    expect(final.entregas.find((e: { id: string }) => e.id === first.id).anulada).toBe(true);
    expect(final.historial.some((e: { accion: string }) => e.accion === 'entrega.anulada')).toBe(
      true,
    );
    const updated = await (
      await request.get('/api/gestion/reportes?desde=2026-01-01&hasta=2026-12-31')
    ).json();
    expect(
      updated.items.some(
        (r: { material: string; unidad: string }) => r.material === material && r.unidad === 'kg',
      ),
    ).toBe(false);
    await request.dispose();
  });
});
