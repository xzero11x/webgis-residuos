import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'database',
    'sh',
    '-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Full_Version();"',
  ],
  { stdio: 'inherit' },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
