import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export function validateRecoveryName(name) {
  if (!/^bagua_restore_\d{14}_[a-f0-9]{8}$/.test(name))
    throw Error('Nombre de recuperación inválido.');
  return name;
}
export async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function argumentsFor(command, args = []) {
  return ['compose', 'exec', '-T', 'database', 'sh', '-c', command, 'bagua-operation', ...args];
}
function run(command, args = []) {
  const result = spawnSync('docker', argumentsFor(command, args), { encoding: 'utf8' });
  if (result.status !== 0)
    throw Error('La operación PostgreSQL falló. No se reemplazó ninguna base existente.');
  return result.stdout.trim();
}
async function stream(command, args, input, output) {
  const child = spawn('docker', argumentsFor(command, args), { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume(); // Errores del servidor pueden contener información del padrón.
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(Error('Operación interrumpida. Se conserva el destino para diagnóstico.')),
    );
  });
  const work = input
    ? pipeline(createReadStream(input), child.stdin)
    : Promise.resolve(child.stdin.end());
  const result = output
    ? pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 }))
    : Promise.resolve(child.stdout.resume());
  await Promise.all([completion, work, result]);
}
export async function main(args) {
  const [action, file] = args;
  if (action === '--help') {
    console.log(
      'node scripts/operational-backup.mjs backup\nnode scripts/operational-backup.mjs restore artifacts/operacion/<corte>/postgis.dump\nRestore exige su manifiesto JSON y crea una BD nueva; nunca reemplaza ni elimina.',
    );
    return;
  }
  if (!['backup', 'restore'].includes(action) || (action === 'backup' && file) || args.length > 2)
    throw Error('Usa --help para consultar las operaciones permitidas.');
  if (action === 'backup') {
    const stamp =
      new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '_' + randomUUID().slice(0, 8);
    const directory = path.resolve('artifacts', 'operacion', stamp);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const dump = path.join(directory, 'postgis.dump');
    const database = run(
      'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT current_database()"',
    );
    await stream(
      'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl',
      [],
      null,
      dump,
    );
    await writeFile(
      dump + '.json',
      JSON.stringify(
        { version: 1, database, creado_en: new Date().toISOString(), sha256: await digest(dump) },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        respaldo: dump,
        verificado_sha256: true,
        incluye: 'PostGIS; copiar aparte data/bagua-master y configuración privada',
      }),
    );
    return;
  }
  if (!file || path.extname(file) !== '.dump')
    throw Error('Indica una copia .dump con su manifiesto .dump.json.');
  const manifest = JSON.parse(await readFile(file + '.json', 'utf8'));
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    (await digest(file)) !== manifest.sha256
  )
    throw Error('La copia o su manifiesto no coinciden. No se creó ninguna base.');
  const target = validateRecoveryName(
    'bagua_restore_' +
      new Date().toISOString().replace(/\D/g, '').slice(0, 14) +
      '_' +
      randomUUID().slice(0, 8),
  );
  run('createdb -U "$POSTGRES_USER" -T template0 "$1"', [target]);
  await stream(
    'pg_restore -U "$POSTGRES_USER" -d "$1" --single-transaction --exit-on-error --no-owner --no-acl',
    [target],
    file,
    null,
  );
  console.log(
    JSON.stringify({
      restaurada_en: target,
      aplicacion_principal_modificada: false,
      siguiente: 'Validar copia antes de autorizar cualquier cambio de conexión.',
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Operación fallida.');
    process.exitCode = 1;
  });
