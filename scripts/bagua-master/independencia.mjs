// Prueba de independencia: compila el frontend con un módulo cartográfico desactivado,
// lo sirve con `vite preview` (API en API_PROXY_TARGET, por defecto la pila Docker) y
// ejecuta tests/e2e/bagua-master-independencia.spec.ts. No modifica dist/ ni los datos.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const api = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
const shell = process.platform === 'win32';
const scenarios = [
  { name: 'sin-bagua-master', port: 4175, env: { VITE_BAGUA_MASTER_ENABLED: 'false' } },
  { name: 'sin-mapa-municipal', port: 4176, env: { VITE_MUNICIPAL_MAP_ENABLED: 'false' } },
];

async function waitFor(url, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No responde ${url}`);
}

let failed = false;
for (const scenario of scenarios) {
  const outDir = mkdtempSync(path.join(tmpdir(), `bagua-${scenario.name}-`));
  const env = { ...process.env, ...scenario.env, API_PROXY_TARGET: api };
  console.log(`\n== ${scenario.name}: compilación`);
  const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: path.join(root, 'frontend'),
    env,
    stdio: 'inherit',
    shell,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const preview = spawn(
    'npx',
    [
      'vite',
      'preview',
      '--outDir',
      outDir,
      '--host',
      '127.0.0.1',
      '--port',
      String(scenario.port),
      '--strictPort',
    ],
    { cwd: path.join(root, 'frontend'), env, stdio: 'ignore', shell },
  );
  try {
    const base = `http://127.0.0.1:${scenario.port}`;
    await waitFor(`${base}/api/health`);
    console.log(`== ${scenario.name}: pruebas`);
    const run = spawnSync(
      'npx',
      [
        'playwright',
        'test',
        'tests/e2e/bagua-master-independencia.spec.ts',
        '--project=desktop',
        '--project=mobile',
        '--reporter=line',
      ],
      {
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_BASE_URL: base, INDEPENDENCIA: scenario.name },
        stdio: 'inherit',
        shell,
      },
    );
    if (run.status !== 0) failed = true;
  } finally {
    if (shell)
      spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
    else preview.kill('SIGTERM');
    rmSync(outDir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
