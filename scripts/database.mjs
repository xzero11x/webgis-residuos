import { spawnSync } from 'node:child_process';
const command = process.argv[2];
if (!['migrate', 'seed', 'clear-demo', 'import-municipal'].includes(command))
  throw new Error('Comando de base no válido.');
const result = spawnSync(
  'docker',
  ['compose', 'exec', '-T', 'backend', 'node', 'backend/dist/db/manage.js', command],
  { stdio: 'inherit' },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
