import { expect, type APIRequestContext } from '@playwright/test';

export async function requireFixtureTarget(request: APIRequestContext, credentials: unknown) {
  const headers = { 'X-Bagua-Request': '1' };
  const login = await request.post('/api/gestion/sesion', { data: credentials, headers });
  expect(login.ok(), 'Se requiere una cuenta local para comprobar el destino de las E2E.').toBe(
    true,
  );
  try {
    const response = await request.get('/api/gestion/entorno');
    expect(response.ok(), 'El destino debe implementar el control de fixtures.').toBe(true);
    expect(
      await response.json(),
      'Las E2E no escriben en destinos institucionales o sin habilitar.',
    ).toMatchObject({ fixturesPermitidos: true });
  } finally {
    await request.post('/api/gestion/salir', { data: {}, headers });
  }
}
