import { pool } from './pool.js';
import { bootstrapAdmin } from './bootstrap-admin-core.js';
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 16384) throw Error('INPUT_LIMIT');
  }
  console.log(JSON.stringify(await bootstrapAdmin(pool, JSON.parse(input))));
} catch (error) {
  // Ni ZodError ni errores pg: ambos pueden incluir valores enviados por stdin.
  const known =
    error instanceof Error &&
    ['BOOTSTRAP_DATABASE_MISMATCH', 'BOOTSTRAP_ALREADY_INITIALIZED'].includes(error.message);
  console.error(
    known
      ? error.message
      : 'BOOTSTRAP_FAILED: revise configuración, migraciones y campos requeridos.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
