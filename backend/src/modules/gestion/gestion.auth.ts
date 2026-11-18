import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../shared/app-error.js';
import type { User } from './gestion.schema.js';

const scrypt = promisify(derive);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [salt, key] = encoded.split(':');
  if (!salt || !key || !/^[a-f0-9]{128}$/.test(key)) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}
const cookieName = 'bagua_gestion';
export function sessionCookie(req: Request) {
  const raw = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : '';
}
export function setSessionCookie(req: Request, res: Response, value: string, maxAge: number) {
  res.cookie(cookieName, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure || req.get('x-forwarded-proto') === 'https',
    path: '/api/gestion',
    maxAge,
  });
}
export function createAuth(pool: Pool, options: { open?: boolean } = {}) {
  const attempts = new Map<string, { count: number; until: number }>();
  const authorize: RequestHandler = async (req, res, next) => {
    const token = sessionCookie(req);
    const result = token
      ? await pool.query(
          `SELECT u.id,u.nombre,u.usuario,u.rol FROM gestion.sesion s
      JOIN gestion.usuario u ON u.id=s.usuario_id WHERE s.token_hash=$1 AND s.expira_en>now() AND u.activo`,
          [tokenHash(token)],
        )
      : null;
    let user = result?.rows[0] as User | undefined;
    if (!user && options.open) {
      // Acceso libre local: se actúa como la primera cuenta administradora activa.
      const admin = await pool.query(
        "SELECT id,nombre,usuario,rol FROM gestion.usuario WHERE rol='administrador' AND activo ORDER BY creado_en,usuario LIMIT 1",
      );
      user = admin.rows[0] as User | undefined;
    }
    if (!user)
      throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para acceder a la gestión.');
    res.locals.user = user;
    next();
  };
  const write: RequestHandler = (_req, res, next) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(
        403,
        'FORBIDDEN',
        'Tu perfil permite consultar, pero no modificar registros.',
      );
    next();
  };
  const privateData: RequestHandler = (_req, res, next) => {
    if ((res.locals.user as User).rol === 'consulta')
      throw new AppError(
        403,
        'FORBIDDEN',
        'Tu perfil no tiene acceso a personas ni a su historial.',
      );
    next();
  };
  async function login(req: Request, res: Response, username: string, password: string) {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    const key = req.ip || 'local';
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    if (entry.count >= 10)
      throw new AppError(429, 'LOGIN_LIMIT', 'Demasiados intentos. Espera 15 minutos.');
    if (attempts.size >= 10000 && !attempts.has(key))
      throw new AppError(429, 'LOGIN_LIMIT', 'Intenta más tarde.');
    entry.count++;
    attempts.set(key, entry);
    const result = await pool.query('SELECT * FROM gestion.usuario WHERE usuario=$1 AND activo', [
      username.toLowerCase(),
    ]);
    const user = result.rows[0];
    const dummy = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await passwordMatches(password, user?.password_hash ?? dummy);
    if (!user || !valid)
      throw new AppError(401, 'INVALID_LOGIN', 'Usuario o contraseña incorrectos.');
    attempts.delete(key);
    const token = randomBytes(32).toString('hex');
    await pool.query('DELETE FROM gestion.sesion WHERE expira_en<=now()');
    await pool.query(
      "INSERT INTO gestion.sesion(token_hash,usuario_id,expira_en) VALUES($1,$2,now()+interval '8 hours')",
      [tokenHash(token), user.id],
    );
    setSessionCookie(req, res, token, 8 * 3600_000);
    return { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol } as User;
  }
  return { authorize, write, privateData, login };
}
