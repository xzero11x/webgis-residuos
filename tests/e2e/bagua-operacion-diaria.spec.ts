import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Operación diaria con la simulación realista: ruta del chofer, tablero del supervisor, pesaje,
// avisos, cierre del mes con sus reportes, carga del padrón (validación) y la ayuda. Las pruebas que
// escriben usan registros propios y los retiran; el resto solo lee.
test.use({ trace: 'off', screenshot: 'off', actionTimeout: 15000 });

const HEADERS = { 'X-Bagua-Request': '1' };
function credentials() {
  const file = 'artifacts/accesos-locales/registro-bagua.txt';
  if (!existsSync(file)) return null;
  const source = readFileSync(file, 'utf8');
  return {
    usuario: source.match(/^Usuario: (.+)$/m)![1]!,
    password: source.match(/^Contraseña: (.+)$/m)![1]!,
  };
}
async function signIn(page: Page) {
  const account = credentials();
  await page.goto('/bagua-master/expedientes');
  const form = await page
    .getByLabel('Contraseña', { exact: true })
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  if (form && account) {
    await page.getByLabel('Usuario', { exact: true }).fill(account.usuario);
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: /^Cuenta de / })).toBeVisible();
}
const limaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

test.describe('Operación diaria del servicio', () => {
  test('el vecino ve la hora habitual y los avisos del servicio', async ({ request }) => {
    const notices = await (await request.get('/api/bagua-master/servicio/avisos')).json();
    expect(Array.isArray(notices.avisos)).toBe(true);
    const res = await request.get('/api/bagua-master/servicio/consulta?lon=-78.5316&lat=-5.6389');
    const { servicios } = await res.json();
    expect(servicios.length).toBeGreaterThan(0);
    for (const s of servicios) {
      expect(Array.isArray(s.avisos)).toBe(true);
      if (s.horaHabitual) {
        expect(s.horaHabitual).toMatch(/^\d{2}:\d{2}$/);
        expect(s.recorridos).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('el supervisor ve el día, las alertas, el mapa y la semana', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Tablero de escritorio.');
    await signIn(page);
    await page.goto('/bagua-master/operacion');
    const board = page.getByTestId('op-tablero');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(board).toContainText('Últimos 7 días');
    await expect(page.locator('.op-ruta').first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'Mapa de las rutas de hoy' })).toBeVisible();
    await page.getByRole('button', { name: 'Cumplimiento', exact: true }).click();
    await expect(page.getByTestId('op-cumplimiento')).toContainText('Programadas');
    await page.getByRole('button', { name: 'Pesaje', exact: true }).click();
    await expect(page.getByTestId('op-pesaje')).toContainText('Tickets registrados');
  });

  test('el chofer elige su ruta y ve sus puntos de control', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'Pantalla del celular.');
    await signIn(page);
    await page.goto('/bagua-master/campo/ruta');
    await expect(page.getByTestId('chofer')).toBeVisible();
    const first = page.locator('.ch-elegir button').first();
    const none = page.getByText('No hay rutas programadas hoy');
    await expect(first.or(none)).toBeVisible({ timeout: 20_000 });
    test.skip(await none.isVisible(), 'Hoy no hay rutas programadas.');
    await first.click();
    await expect(page.getByRole('heading', { name: /Puntos de control/ })).toBeVisible();
    await expect(page.locator('.ch-puntos li').first()).toBeVisible();
    await expect(page.getByTestId('ch-cola')).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar de ruta' }).click();
    await expect(page.locator('.ch-elegir')).toBeVisible();
  });

  test('un aviso publicado llega a la consulta y se retira con motivo', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Escritura una sola vez.');
    await signIn(page);
    const env = await (await page.request.get('/api/gestion/entorno')).json();
    test.skip(!env.fixturesPermitidos, 'Destino sin datos de prueba habilitados.');
    const today = limaToday();
    const created = await page.request.post('/api/gestion/avisos', {
      headers: HEADERS,
      data: {
        tipo: 'informativo',
        titulo: 'Prueba automática de avisos',
        mensaje: 'Aviso de prueba que se retira al terminar.',
        programaciones: [],
        desde: today,
        hasta: today,
      },
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    const at = await (
      await page.request.get('/api/bagua-master/servicio/consulta?lon=-78.5316&lat=-5.6389')
    ).json();
    expect(JSON.stringify(at.servicios)).toContain('Prueba automática de avisos');
    const retired = await page.request.post(`/api/gestion/avisos/${id}/retirar`, {
      headers: HEADERS,
      data: { motivo: 'Fin de la prueba automática' },
    });
    expect(retired.status()).toBe(204);
  });

  test('el cierre del mes muestra pendientes y entrega el reporte SIGERSOL', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'Escritorio.');
    await signIn(page);
    await page.goto('/bagua-master/resultados?vista=cierre');
    await expect(page.getByTestId('cierre-mes')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Recolectado y pesado')).toBeVisible();
    const periods = await (await page.request.get('/api/gestion/periodos')).json();
    const month = periods.items.find((p: { mes: string }) => p.mes < periods.mesActual)?.mes;
    test.skip(!month, 'Sin meses terminados.');
    const csv = await page.request.get(
      `/api/gestion/reportes/sigersol.csv?desde=${month}&hasta=${month}`,
    );
    expect(csv.ok()).toBe(true);
    const text = await csv.text();
    expect(text).toContain('Residuos municipales recolectados');
    expect(text).toContain('Programa de segregación en la fuente');
    await page.goto(`/bagua-master/concejo/${month}`);
    await expect(page.getByRole('heading', { name: /Servicio de limpieza pública/ })).toBeVisible();
  });

  test('la validación del padrón señala cada error con su fila', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Escritorio.');
    await signIn(page);
    const session = await (await page.request.get('/api/gestion/sesion')).json();
    test.skip(session.rol !== 'administrador', 'Solo administración carga el padrón.');
    const res = await page.request.post('/api/gestion/padron/importar/validar', {
      headers: HEADERS,
      data: {
        servicio: 'reciclables',
        tipoGenerador: 'domiciliario',
        archivo: 'prueba.csv',
        sha256: 'b'.repeat(64),
        filas: [
          {
            fila: 2,
            direccion: 'JR. AMAZONAS N° 345',
            representante: 'Rosa Mego Díaz',
            dni: '1234567',
            habitantes: '4',
          },
          { fila: 3, direccion: '', representante: 'Sin Dirección Alguna', habitantes: '2' },
          {
            fila: 4,
            direccion: 'Jr. Amazonas 999',
            representante: 'Otra Persona',
            dni: '01234567',
            habitantes: '70',
          },
        ],
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.filas[0].avisos.join(' ')).toContain('cero inicial');
    expect(body.filas[1].errores.join(' ')).toContain('dirección');
    expect(body.filas[2].errores.join(' ')).toMatch(/DNI 01234567 con otro nombre|Habitantes/);
  });

  test('la ayuda explica cada rol', async ({ page }) => {
    await signIn(page);
    await page.goto('/bagua-master/ayuda');
    await expect(page.getByRole('heading', { name: 'Cómo se usa WEBGIS BAGUA' })).toBeVisible();
    await page.getByRole('button', { name: 'Supervisor y gerente' }).click();
    await expect(page.getByText(/cierra el mes anterior/)).toBeVisible();
  });
});
