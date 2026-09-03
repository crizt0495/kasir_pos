import { hasPermission } from './permission.js';

/** Tentukan halaman awal setelah login sesuai hak akses user.
 *  Kasir tanpa dashboard.view dikirim ke POS; selebihnya ke Dashboard. */
export function landingPath(user, fallback = '/dashboard') {
  if (!user) return fallback;
  return hasPermission(user, 'dashboard.view') ? '/dashboard' : '/pos';
}