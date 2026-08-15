import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../api/index.js';
import { hasPermission, hasAnyPermission } from '../utils/permission.js';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      loading: true,
      setSession: (user) => set({ user, loading: false }),
      setLoading: (loading) => set({ loading }),
      clear: () => set({ user: null, loading: false }),

      /** Muat ulang sesi dari /auth/me saat aplikasi dibuka */
      bootstrap: async () => {
        try {
          const res = await authApi.me();
          set({ user: res.data, loading: false });
        } catch {
          set({ user: null, loading: false });
        }
      },

      /** Helper permission: cek punya semua permission yang diberikan */
      can: (codes) => hasPermission(useAuthStore.getState().user, codes),

      /** Cek punya salah satu permission */
      hasAny: (codes) => hasAnyPermission(useAuthStore.getState().user, codes),

      /** Nama tampilan user */
      displayName: () => {
        const u = useAuthStore.getState().user;
        if (!u) return '';
        return u.profile?.full_name || u.username;
      },

      /** Nama role utama */
      primaryRole: () => {
        const u = useAuthStore.getState().user;
        if (!u || !u.roles?.length) return '-';
        return u.roles[0].name;
      },
    }),
    {
      name: 'pos-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

// Sesi kedaluwarsa (401) → bersihkan state; redirect ditangani App
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    useAuthStore.getState().clear();
  });
}

/** Hook singkat: cek permission */
export function useCan() {
  return (codes) => useAuthStore.getState().can(codes);
}
