/**
 * Cek apakah user memiliki SEMUA permission yang diberikan.
 * @param user { permissions: string[] } | null
 * @param codes string | string[]
 */
export function hasPermission(user, codes) {
  if (!user) return false;
  const perms = new Set(user.permissions || []);
  return (Array.isArray(codes) ? codes : [codes]).every((c) => perms.has(c));
}

/** Cek apakah user memiliki SALAH SATU dari permission yang diberikan. */
export function hasAnyPermission(user, codes) {
  if (!user) return false;
  const perms = new Set(user.permissions || []);
  return (Array.isArray(codes) ? codes : [codes]).some((c) => perms.has(c));
}
