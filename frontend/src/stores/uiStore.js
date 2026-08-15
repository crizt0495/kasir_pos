import { create } from 'zustand';

let toastId = 0;

export const useUiStore = create((set) => ({
  toasts: [],
  globalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),

  pushToast: (message, type = 'success') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message) => useUiStore.getState().pushToast(message, 'success'),
  error: (message) => useUiStore.getState().pushToast(message, 'error'),
  info: (message) => useUiStore.getState().pushToast(message, 'info'),
};
