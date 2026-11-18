import { z } from 'zod';
import { pool } from './pool.js';
import { passwordHash } from '../modules/gestion/gestion.auth.js';
import { roleSchema } from '../modules/gestion/gestion.schema.js';
import { env } from '../config/env.js';
import { assertFixtureTarget } from './fixture-target.js';

try {
  // Este CLI genera perfiles provisionales de desarrollo; no altas institucionales.
  await assertFixtureTarget(pool, env);
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const data = z
    .object({
      usuario: z.string().regex(/^[a-z0-9_-]{3,50}$/),
      nombre: z.string().trim().min(2).max(120),
      rol: roleSchema,
      password: z.string().min(16).max(200),
    })
    .strict()
    .parse(JSON.parse(input));
  const result = await pool.query(
    `INSERT INTO gestion.usuario(usuario,nombre,rol,password_hash) VALUES($1,$2,$3,$4)
    ON CONFLICT(usuario) DO NOTHING RETURNING id`,
    [data.usuario, data.nombre, data.rol, await passwordHash(data.password)],
  );
  if (!result.rowCount) throw new Error('El usuario ya existe. Se conserva su contraseña y rol.');
  console.log(JSON.stringify({ creado: true, usuario: data.usuario, rol: data.rol }));
} catch (e) {
  console.error(e instanceof Error ? e.message : 'No se pudo crear el acceso.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
