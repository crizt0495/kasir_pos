import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { loadUserAuth } from '../services/authService.js';
import { AppError, unauthorized } from '../utils/errors.js';

const TOKEN_COOKIE = 'pos_token';

export function setAuthCookie(res, token, rememberMe) {
  const maxAge = rememberMe ? 7 * 24 * 3600 * 1000 : 8 * 3600 * 1000;
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
}

/** Middleware: wajib login. Memuat user + permission dari database. */
export async function requireAuth(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies[TOKEN_COOKIE]) ||
      (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));

    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new AppError('Sesi berakhir, silakan login kembali', { code: 'SESSION_EXPIRED', status: 401 });
    }

    const user = await loadUserAuth(payload.uid);
    if (!user) throw unauthorized('Akun tidak ditemukan');
    if (!user.is_active) {
      throw new AppError('Akun Anda dinonaktifkan', { code: 'ACCOUNT_DISABLED', status: 403 });
    }
    if (user.token_version !== payload.tv) {
      throw new AppError('Sesi berakhir, silakan login kembali', { code: 'SESSION_EXPIRED', status: 401 });
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Middleware: wajib punya permission tertentu → 403 Forbidden */
export function requirePermission(code) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.has(code)) {
      return next(new AppError('Anda tidak memiliki akses', { code: 'FORBIDDEN', status: 403 }));
    }
    return next();
  };
}
