import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const options = Object.fromEntries(
  process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')),
);
const usuario = options.usuario || 'admin-bagua',
  rol = options.rol || 'administrador';
if (!/^[a-z0-9_-]{3,50}$/.test(usuario) || !['administrador', 'registro', 'consulta'].includes(rol))
  throw Error('Usuario o rol inválido.');
const password = randomBytes(24).toString('base64url');
const local = process.argv.includes('--local');
const result = spawnSync(
  local ? process.execPath : 'docker',
  local
    ? ['backend/dist/db/gestion-access.js']
    : ['compose', 'exec', '-T', 'backend', 'node', 'backend/dist/db/gestion-access.js'],
  {
    input: JSON.stringify({
      usuario,
      nombre: options.nombre || `Acceso de desarrollo ${usuario}`,
      rol,
      password,
    }),
    encoding: 'utf8',
  },
);
if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'No se pudo crear el acceso.');
  process.exit(1);
}
const directory = path.resolve('artifacts', 'accesos-locales');
mkdirSync(directory, { recursive: true });
const file = path.join(directory, `${usuario}.txt`);
writeFileSync(
  file,
  `BAGUA MASTER · acceso local de desarrollo\nhttp://localhost:8080/bagua-master/gestion\nUsuario: ${usuario}\nContraseña: ${password}\nPerfil técnico provisional: ${rol}\nNo publicar ni incluir en Git.\n`,
  { mode: 0o600 },
);
console.log(`Acceso creado. Credenciales guardadas solo en ${file}`);
