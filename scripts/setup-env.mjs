import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const rootEnv = resolve(root, '.env');
if (!existsSync(rootEnv)) {
  const template = readFileSync(resolve(root, '.env.example'), 'utf8');
  writeFileSync(
    rootEnv,
    template.replace('POSTGRES_PASSWORD=', `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`),
  );
  console.log('Creado .env con una contraseña local aleatoria.');
}
const rootContents = readFileSync(rootEnv, 'utf8');
const value = (key) => rootContents.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
if (!value('POSTGRES_PASSWORD')) {
  throw new Error(
    'Configura POSTGRES_PASSWORD en .env antes de continuar. No se ha modificado el archivo existente.',
  );
}
for (const workspace of ['frontend', 'backend']) {
  const target = resolve(root, workspace, '.env');
  if (existsSync(target)) continue;
  let contents = readFileSync(resolve(root, workspace, '.env.example'), 'utf8');
  if (workspace === 'backend') {
    contents = contents
      .replace(/^PGPASSWORD=.*$/m, `PGPASSWORD=${value('POSTGRES_PASSWORD')}`)
      .replace(/^PGUSER=.*$/m, `PGUSER=${value('POSTGRES_USER')}`)
      .replace(/^PGDATABASE=.*$/m, `PGDATABASE=${value('POSTGRES_DB')}`);
  }
  writeFileSync(target, contents);
  console.log(`Creado ${workspace}/.env.`);
}
console.log('Configuración lista. Los archivos existentes se conservan.');
