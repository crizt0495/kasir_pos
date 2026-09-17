import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../api/index.js';
import { hasPermission, hasAnyPermission } from '../utils/permission.js';
import { isOffline, startConnectivityMonitor } from '../utils/connectivity.js';

const STORAGE_KEY = 'pos-auth';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      setSession: (user) => set({ user, loading: false }),
      setLoading: (loading) => set({ loading }),

      /**
       * Bersihkan sesi. SAAT OFFLINE: sesi TIDAK dihapus — jaga agar POS
       * tetap berfungsi tanpa internet. Hanya dipanggil oleh
       * auto-logout paths (auth:expired, focus handler, bootstrap).
       * Untuk logout paksa / ganti password, pakai forceClear().
       */
      clear: () => {
        if (isOffline()) return;
        set({ user: null, loading: false });
      },

      /**
       * Hapus sesi tanpa syarat — dipakai oleh tombol Logout manual
       * dan setelah ganti password (user pasti ONLINE saat aksi ini).
       */
      forceClear: () => {
        set({ user: null, loading: false, _skipRestore: true });
      },

      /** Muat ulang sesi dari /auth/me saat aplikasi dibuka */
      bootstrap: async () => {
        try {
          const res = await authApi.me();
          // /auth/me bisa balas 200 + data:null (cookie kedaluwarsa/hilang).
          // Saat offline, jangan hapus sesi — pertahankan user terdahulu.
          if (res.data) {
            set({ user: res.data, loading: false });
          } else if (isOffline()) {
            set({ user: get().user, loading: false });
          } else {
            set({ user: null, loading: false });
          }
        } catch (error) {
          const isAuth =
            error?.response?.status === 401 && !isOffline();
          if (isAuth) {
            set({ user: null, loading: false });
          } else {
            set({ user: get().user, loading: false });
          }
        }
      },

      /** Helper permission: cek punya semua permission yang diberikan */
      can: (codes) => hasPermission(get().user, codes),

      /** Cek punya salah satu permission */
      hasAny: (codes) => hasAnyPermission(get().user, codes),

      /** Nama tampilan user */
      displayName: () => {
        const u = get().user;
        if (!u) return '';
        return u.profile?.full_name || u.username;
      },

      /** Nama role utama */
      primaryRole: () => {
        const u = get().user;
        if (!u || !u.roles?.length) return '-';
        return u.roles[0].name;
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ user: state.user }),
    }
  )
);

// ────────────────────────────────────────────────────────────────
// SAFETY NET: jika user menjadi null saat offline (apapun penyebabnya),
// pulihkan dari cache lokal agar POS tetap berfungsi. Ini menangkap
// SEMUA jalur yang mungkin terlewat — termasuk code path yang belum
// kita temukan di review.
// ────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  startConnectivityMonitor();
  let lastUser = useAuthStore.getState().user;

  useAuthStore.subscribe((state) => {
    if (state._skipRestore) {
      lastUser = null;
      useAuthStore.setState({ _skipRestore: false });
      return;
    }
    if (state.user) {
      lastUser = state.user;
      return;
    }
    if (lastUser && isOffline()) {
      useAuthStore.setState({ user: lastUser, loading: false });
      lastUser = null;
    }
  });

  // Sesi kedaluwarsa (401) → bersihkan state; redirect ditangani App.
  // Saat offline, event auth:expired diabaikan — sesi tetap dipertahankan.
  window.addEventListener('auth:expired', () => {
    if (isOffline()) return;
    useAuthStore.getState().clear();
  });
}

/** Hook singkat: cek permission */
export function useCan() {
  return (codes) => useAuthStore.getState().can(codes);
}
