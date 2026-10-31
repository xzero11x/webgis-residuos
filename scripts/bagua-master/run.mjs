// Ejecutor de los pasos de BAGUA MASTER desde npm en PowerShell, cmd o bash.
// Localiza el Python del entorno de desarrollo (.venv-gis) en Windows y en Linux/macOS.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const steps = {
  alturas: ['python', 'estimate_heights.py', '--importar'],
  'descargar-alturas-gba': ['python', 'download_gba.py'],
  'importar-alturas-gba': ['python', 'import_gba_heights.py', '--importar'],
  'completar-alturas': ['python', 'complete_heights.py', '--importar'],
  descargar: ['python', 'overture_download.py'],
  verificar: ['python', 'overture_download.py', '--verify'],
  paquete: ['python', 'build_package.py'],
  rotulos: ['python', 'build_rotulos.py'],
  'zonas-nombres': ['python', 'zonas_nombres.py'],
  glifos: ['python', 'fetch_glyphs.py'],
  'imagen-teselas': [
    'docker',
    'build',
    '-f',
    'infrastructure/docker/tiles.Dockerfile',
    '-t',
    'bagua-master-tiles:2.79.0',
    '.',
  ],
  teselas: ['python', 'build_tiles.py'],
  importar: [
    'docker',
    'compose',
    'exec',
    '-T',
    'backend',
    'node',
    'backend/dist/db/import-bagua-master.js',
  ],
  'importar-nombres': [
    'docker',
    'compose',
    'exec',
    '-T',
    'backend',
    'node',
    'backend/dist/db/import-bagua-master-nombres.js',
  ],
  'importar-rutas': [
    'docker',
    'compose',
    'exec',
    '-T',
    'backend',
    'node',
    'backend/dist/db/import-bagua-master-rutas.js',
  ],
  'exportar-rutas': ['python', 'export_rutas.py'],
  'nombres-dwg': ['python', 'nombres_dwg.py'],
  'proteccion-escribir': ['python', 'protection_baseline.py', '--write'],
  'proteccion-verificar': ['python', 'protection_baseline.py', '--verify'],
};
const step = process.argv[2];
if (!steps[step]) {
  console.error(`Paso desconocido. Disponibles: ${Object.keys(steps).join(', ')}`);
  process.exit(2);
}
const [tool, ...args] = steps[step];
let command = tool;
let commandArgs = args;
if (tool === 'python') {
  const candidates = [
    path.join(root, '.venv-gis', 'Scripts', 'python.exe'),
    path.join(root, '.venv-gis', 'bin', 'python'),
  ];
  command = candidates.find((c) => existsSync(c));
  if (!command) {
    console.error(
      'Falta el entorno .venv-gis: créelo e instale scripts/gis/requirements.txt y duckdb.',
    );
    process.exit(2);
  }
  commandArgs = [
    // Mantiene el directorio del script para importar los helpers GIS del proyecto.
    '-E',
    '-s',
    '-X',
    'utf8',
    path.join(root, 'scripts', 'bagua-master', args[0]),
    ...args.slice(1),
  ];
}
const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
