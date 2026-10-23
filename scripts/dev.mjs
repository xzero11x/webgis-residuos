import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Arranca la base de datos, luego frontend y backend en modo desarrollo.
// Los cambios de código ya se recargan solos (tsx watch y Vite HMR).
// Los cambios en archivos .env no los recoge ninguno de los dos, así que
// este script reinicia el modo desarrollo cuando cambian.

const root = fileURLToPath(new URL('../', import.meta.url));
const envFiles = ['.env', 'backend/.env', 'frontend/.env']
  .map((file) => resolve(root, file))
  .filter((file) => existsSync(file));

const run = (command, args, options = {}) =>
  spawn(command, args, { cwd: root, stdio: 'inherit', shell: true, ...options });

const waitFor = (child) =>
  new Promise((resolvePromise, reject) => {
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`Salió con código ${code}`)),
    );
  });

let app = null;
let restarting = false;
let timer = null;

function startApp() {
  app = run('npm', ['run', 'dev']);
  app.on('exit', (code) => {
    if (!restarting) console.log(`[dev] La aplicación terminó con código ${code}.`);
  });
}

function stopApp() {
  return new Promise((resolvePromise) => {
    if (!app || app.exitCode !== null) return resolvePromise();
    app.once('exit', resolvePromise);
    app.kill();
  });
}

function scheduleRestart(file) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    restarting = true;
    console.log(`\n[dev] Cambio en ${file}. Reiniciando frontend y backend...\n`);
    await stopApp();
    restarting = false;
    startApp();
  }, 500);
}

try {
  console.log('[dev] Levantando PostgreSQL/PostGIS...');
  await waitFor(
    run('docker', [
      'compose',
      '-f',
      'compose.yaml',
      '-f',
      'infrastructure/compose.dev.yaml',
      'up',
      '-d',
      '--wait',
      'database',
    ]),
  );
} catch (error) {
  console.error(`[dev] No se pudo levantar la base de datos: ${error.message}`);
  console.error('[dev] Revisa que Docker Desktop esté abierto y ejecuta npm run setup:env.');
  process.exit(1);
}

console.log('[dev] Base de datos lista. Iniciando aplicación.');
console.log('[dev] Frontend: http://127.0.0.1:5173   API: http://127.0.0.1:3000/api/health');
console.log('[dev] Vigilando cambios en .env. Ctrl+C para detener.\n');

for (const file of envFiles) {
  watch(file, () => scheduleRestart(file.replace(root, '')));
}

startApp();

const shutdown = async () => {
  clearTimeout(timer);
  await stopApp();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
