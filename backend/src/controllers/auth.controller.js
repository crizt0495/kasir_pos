import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { loadUserAuth, serializeSession } from '../services/authService.js';
import { writeAudit } from '../services/auditService.js';
import { setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { AppError, unauthorized, conflict, badRequest } from '../utils/errors.js';
import { ok, created } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const login = asyncHandler(async (req, res) => {
  const { username, password, rememberMe } = req.body;
  const normalized = username.trim().toLowerCase();

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', normalized)
    .maybeSingle();

  if (error || !user) {
    throw unauthorized('Username atau password salah', 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw unauthorized('Username atau password salah', 'INVALID_CREDENTIALS');
  if (!user.is_active) {
    throw new AppError('Akun Anda dinonaktifkan, hubungi administrator', { code: 'ACCOUNT_DISABLED', status: 403 });
  }

  const full = await loadUserAuth(user.id);

  const expiresIn = rememberMe ? env.JWT_REMEMBER_EXPIRES_IN : env.JWT_EXPIRES_IN;
  const token = jwt.sign({ uid: user.id, username: user.username, tv: user.token_version }, env.JWT_SECRET, { expiresIn });

  setAuthCookie(res, token, rememberMe);

  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
  await writeAudit({ user: { id: user.id, username: user.username }, action: 'USER_LOGIN', module: 'auth', req });

  return ok(res, serializeSession(full), 'Login berhasil');
});

export const logout = asyncHandler(async (req, res) => {
  await writeAudit({ user: req.user, action: 'USER_LOGOUT', module: 'auth', req });
  clearAuthCookie(res);
  return ok(res, null, 'Logout berhasil');
});

export const me = asyncHandler(async (req, res) => {
  return ok(res, serializeSession(req.user), 'Berhasil');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).maybeSingle();
  if (!user) throw unauthorized();

  // Jika belum wajib ganti password, verifikasi password lama
  if (!req.user.must_change_password) {
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw badRequest('Password saat ini salah', 'INVALID_CURRENT_PASSWORD');
  }
  if (currentPassword && (await bcrypt.compare(newPassword, user.password_hash))) {
    throw conflict('Password baru tidak boleh sama dengan password lama', 'PASSWORD_SAME');
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await supabase
    .from('users')
    .update({ password_hash: hash, must_change_password: false, token_version: req.user.token_version + 1 })
    .eq('id', req.user.id);

  await writeAudit({ user: req.user, action: 'PASSWORD_CHANGED', module: 'auth', recordId: req.user.id, req });

  // Token lama di-invalidasi (token_version bertambah) → minta login ulang
  clearAuthCookie(res);
  return ok(res, null, 'Password berhasil diubah, silakan login kembali');
});

export { created };
