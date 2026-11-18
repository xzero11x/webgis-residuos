import type { Pool } from 'pg';
import { z } from 'zod';
import { passwordHash } from '../modules/gestion/gestion.auth.js';

export const bootstrapInput = z
  .object({
    baseConfirmada: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/),
    usuario: z.string().regex(/^[a-z0-9_-]{3,50}$/),
    nombre: z.string().trim().min(2).max(120),
    password: z.string().min(16).max(200),
  })
  .strict();

/** Inicialización excepcional por operador de infraestructura, nunca mediante HTTP. */
export async function bootstrapAdmin(pool: Pool, input: unknown) {
  const data = bootstrapInput.parse(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('gestion-users'))");
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
    if (database !== data.baseConfirmada) throw Error('BOOTSTRAP_DATABASE_MISMATCH');
    // No es una recuperación ni un mecanismo alternativo para gestionar cuentas.
    const count = (await client.query('SELECT count(*)::int AS total FROM gestion.usuario')).rows[0]
      .total;
    if (count !== 0) throw Error('BOOTSTRAP_ALREADY_INITIALIZED');
    const created = (
      await client.query(
        "INSERT INTO gestion.usuario(usuario,nombre,rol,password_hash) VALUES($1,$2,'administrador',$3) RETURNING id",
        [data.usuario, data.nombre, await passwordHash(data.password)],
      )
    ).rows[0];
    await client.query(
      "INSERT INTO gestion.historial(usuario_id,accion,nuevo) VALUES($1,'usuario.bootstrap',$2)",
      [created.id, { usuario_id: created.id, inicial: true }],
    );
    await client.query('COMMIT');
    return { creado: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
