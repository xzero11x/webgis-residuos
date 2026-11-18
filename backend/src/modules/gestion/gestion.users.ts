import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import { passwordHash, passwordMatches, setSessionCookie } from './gestion.auth.js';
import { audit, transaction } from './gestion.repository.js';
import { roleSchema, type User } from './gestion.schema.js';

const publicColumns = 'id,nombre,usuario,rol,activo,version,creado_en';
const password = z.string().min(16).max(200);
export const resetPasswordInput = z
  .object({
    actualAdministrador: z.string().min(1).max(200),
    nueva: password,
    motivo: z.string().trim().min(5).max(1000),
    version: z.number().int().positive(),
  })
  .strict();
export function createUsersRouter(pool: Pool) {
  const router = Router();
  router.post('/password', async (req, res) => {
    const data = z
      .object({ actual: z.string().min(1).max(200), nueva: password })
      .strict()
      .parse(req.body);
    await transaction(pool, async (c) => {
      const user = res.locals.user as User;
      const row = (
        await c.query('SELECT password_hash FROM gestion.usuario WHERE id=$1 FOR UPDATE', [user.id])
      ).rows[0];
      if (!row || !(await passwordMatches(data.actual, row.password_hash)))
        throw new AppError(400, 'PASSWORD_INVALID', 'La contraseña actual no coincide.');
      if (data.actual === data.nueva)
        throw new AppError(400, 'PASSWORD_SAME', 'La contraseña nueva debe ser diferente.');
      await c.query('UPDATE gestion.usuario SET password_hash=$2,version=version+1 WHERE id=$1', [
        user.id,
        await passwordHash(data.nueva),
      ]);
      await c.query('DELETE FROM gestion.sesion WHERE usuario_id=$1', [user.id]);
      await audit(c, user, null, 'usuario.password', null, {
        usuario_id: user.id,
        sesionesRevocadas: true,
      });
    });
    setSessionCookie(req, res, '', 0);
    res.status(204).end();
  });
  router.use('/usuarios', (_req, res, next) => {
    if ((res.locals.user as User).rol !== 'administrador')
      throw new AppError(403, 'FORBIDDEN', 'Solo administración gestiona cuentas de prueba.');
    next();
  });
  router.get('/usuarios', async (_req, res) =>
    res.json({
      items: (
        await pool.query(`SELECT ${publicColumns} FROM gestion.usuario ORDER BY usuario LIMIT 200`)
      ).rows,
    }),
  );
  router.post('/usuarios/:id/password', async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      data = resetPasswordInput.parse(req.body);
    const actor = res.locals.user as User;
    if (id === actor.id)
      throw new AppError(
        409,
        'OWN_PASSWORD',
        'Utiliza Cambiar mi contraseña para tu propia cuenta.',
      );
    await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('gestion-users'))");
      const administrator = (
        await c.query(
          'SELECT password_hash,activo,rol FROM gestion.usuario WHERE id=$1 FOR UPDATE',
          [actor.id],
        )
      ).rows[0];
      if (
        !administrator?.activo ||
        administrator.rol !== 'administrador' ||
        !(await passwordMatches(data.actualAdministrador, administrator.password_hash))
      )
        throw new AppError(
          403,
          'PASSWORD_INVALID',
          'No se pudo verificar tu autorización administrativa.',
        );
      const target = (
        await c.query(
          'SELECT id,version,activo,password_hash FROM gestion.usuario WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!target) throw new AppError(404, 'NOT_FOUND', 'Cuenta no encontrada.');
      if (target.version !== data.version)
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'La cuenta cambió; recarga antes de restablecer.',
        );
      if (!target.activo)
        throw new AppError(
          409,
          'INACTIVE_USER',
          'Activa explícitamente la cuenta antes de restablecer su contraseña.',
        );
      if (await passwordMatches(data.nueva, target.password_hash))
        throw new AppError(400, 'PASSWORD_SAME', 'La contraseña nueva debe ser diferente.');
      await c.query('UPDATE gestion.usuario SET password_hash=$2,version=version+1 WHERE id=$1', [
        id,
        await passwordHash(data.nueva),
      ]);
      await c.query('DELETE FROM gestion.sesion WHERE usuario_id=$1', [id]);
      await audit(c, actor, null, 'usuario.password_restablecida', null, {
        usuario_id: id,
        motivo: data.motivo,
        sesionesRevocadas: true,
      });
    });
    res.status(204).end();
  });
  router.post('/usuarios', async (req, res) => {
    const input = z
      .object({
        usuario: z.string().regex(/^[a-z0-9_-]{3,50}$/),
        nombre: z.string().trim().min(2).max(120),
        rol: roleSchema,
        password,
      })
      .strict()
      .parse(req.body);
    const hash = await passwordHash(input.password);
    res.status(201).json(
      await transaction(pool, async (c) => {
        const user = (
          await c.query(
            `INSERT INTO gestion.usuario(usuario,nombre,rol,password_hash) VALUES($1,$2,$3,$4) RETURNING ${publicColumns}`,
            [input.usuario, input.nombre, input.rol, hash],
          )
        ).rows[0];
        await audit(c, res.locals.user, null, 'usuario.creado', null, user);
        return user;
      }),
    );
  });
  router.patch('/usuarios/:id', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const data = z
      .object({
        nombre: z.string().trim().min(2).max(120),
        rol: roleSchema,
        activo: z.boolean(),
        version: z.number().int().positive(),
      })
      .strict()
      .parse(req.body);
    res.json(
      await transaction(pool, async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext('gestion-users'))");
        const before = (
          await c.query(`SELECT ${publicColumns} FROM gestion.usuario WHERE id=$1 FOR UPDATE`, [id])
        ).rows[0];
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Cuenta no encontrada.');
        if (before.version !== data.version)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'La cuenta cambió; recarga antes de guardar.',
          );
        if (id === (res.locals.user as User).id && (!data.activo || data.rol !== 'administrador'))
          throw new AppError(
            409,
            'SELF_LOCKOUT',
            'Conserva tu acceso administrador; otra cuenta autorizada debe gestionar ese cambio.',
          );
        if (
          before.activo &&
          before.rol === 'administrador' &&
          (!data.activo || data.rol !== 'administrador')
        ) {
          const count = (
            await c.query(
              "SELECT count(*)::int AS total FROM gestion.usuario WHERE activo AND rol='administrador'",
            )
          ).rows[0].total;
          if (count <= 1)
            throw new AppError(
              409,
              'LAST_ADMIN',
              'Debe conservarse al menos una cuenta administradora activa.',
            );
        }
        const after = (
          await c.query(
            `UPDATE gestion.usuario SET nombre=$2,rol=$3,activo=$4,version=version+1 WHERE id=$1 RETURNING ${publicColumns}`,
            [id, data.nombre, data.rol, data.activo],
          )
        ).rows[0];
        if (id !== (res.locals.user as User).id)
          await c.query('DELETE FROM gestion.sesion WHERE usuario_id=$1', [id]);
        await audit(c, res.locals.user, null, 'usuario.actualizado', before, after);
        return after;
      }),
    );
  });
  return router;
}
