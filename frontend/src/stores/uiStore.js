import { create } from 'zustand';

let toastId = 0;

export const useUiStore = create((set) => ({
  toasts: [],
  globalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),

  pushToast: (message, type = 'success', action) => {
    const id = ++toastId;
    const timeout = action ? 10000 : 4000;
    set((state) => ({ toasts: [...state.toasts, { id, message, type, action }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, timeout);
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message, action) => useUiStore.getState().pushToast(message, 'success', action),
  error: (message, action) => useUiStore.getState().pushToast(message, 'error', action),
  info: (message, action) => useUiStore.getState().pushToast(message, 'info', action),
};