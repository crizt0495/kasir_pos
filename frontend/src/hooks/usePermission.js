import { useCallback, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore.js';

/** Cek permission secara reaktif */
export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const permissions = useMemo(() => new Set(user?.permissions || []), [user]);

  // Referensi STABIL (useCallback) — mencegah consumer (mis. NotificationsBell)
  // memicu useEffect berulang-ulang yang menyebabkan request API tak terkendali.
  const can = useCallback(
    (codes) => (Array.isArray(codes) ? codes : [codes]).every((c) => permissions.has(c)),
    [permissions]
  );
  const hasAny = useCallback(
    (codes) => (Array.isArray(codes) ? codes : [codes]).some((c) => permissions.has(c)),
    [permissions]
  );

  return { can, hasAny };
}
