import { useAuthStore } from '../stores/authStore.js';

/** Cek permission secara reaktif */
export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions || []);
  return {
    can: (codes) => (Array.isArray(codes) ? codes : [codes]).every((c) => permissions.has(c)),
    hasAny: (codes) => (Array.isArray(codes) ? codes : [codes]).some((c) => permissions.has(c)),
  };
}
