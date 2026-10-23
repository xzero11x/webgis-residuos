import { describe, expect, it } from 'vitest';
import { frontendEnvSchema } from './env';

describe('Configuración del frontend', () => {
  it('arranca sin proveedor y utiliza el proxy del mismo origen', () => {
    expect(frontendEnvSchema.parse({})).toEqual({
      VITE_API_BASE_URL: '/api',
      VITE_MAP_STYLE_URL: '',
      VITE_MUNICIPAL_MAP_ENABLED: 'true',
      VITE_BAGUA_MASTER_ENABLED: 'true',
    });
  });
  it('permite ocultar cada módulo cartográfico por separado', () => {
    const sinMaster = frontendEnvSchema.parse({ VITE_BAGUA_MASTER_ENABLED: 'false' });
    expect(sinMaster.VITE_BAGUA_MASTER_ENABLED).toBe('false');
    expect(sinMaster.VITE_MUNICIPAL_MAP_ENABLED).toBe('true');
    const sinMunicipal = frontendEnvSchema.parse({ VITE_MUNICIPAL_MAP_ENABLED: 'false' });
    expect(sinMunicipal.VITE_MUNICIPAL_MAP_ENABLED).toBe('false');
    expect(sinMunicipal.VITE_BAGUA_MASTER_ENABLED).toBe('true');
    expect(frontendEnvSchema.safeParse({ VITE_BAGUA_MASTER_ENABLED: 'sí' }).success).toBe(false);
  });
  it('acepta un estilo configurable por HTTP(S)', () => {
    expect(
      frontendEnvSchema.parse({ VITE_MAP_STYLE_URL: 'https://maps.example.org/style.json' })
        .VITE_MAP_STYLE_URL,
    ).toBe('https://maps.example.org/style.json');
  });
  it('rechaza protocolos no seguros como código y rutas de API externas', () => {
    expect(frontendEnvSchema.safeParse({ VITE_MAP_STYLE_URL: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(frontendEnvSchema.safeParse({ VITE_API_BASE_URL: '//remote.example' }).success).toBe(
      false,
    );
  });
});
