import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeTotals } from '../utils/cart.js';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [], // [{ product, quantity, discount }]
      discount: 0,
      customer: null,
      heldCarts: [], // [{ id, items, discount, customer, heldAt }]

      add: (product, quantity = 1) => {
        if (Number(product.stock) <= 0) return false;
        const items = [...get().items];
        const existing = items.find((i) => i.product.id === product.id);
        if (existing) {
          if (existing.quantity + quantity > Number(product.stock)) return false;
          existing.quantity += quantity;
        } else {
          if (quantity > Number(product.stock)) return false;
          items.push({ product, quantity, discount: 0 });
        }
        set({ items });
        return true;
      },

      increment: (productId) => {
        const item = get().items.find((i) => i.product.id === productId);
        if (item && item.quantity + 1 > Number(item.product.stock)) return false;
        const items = get().items.map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + 1 } : i
        );
        set({ items });
        return true;
      },

      decrement: (productId) => {
        const items = get().items
          .map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i))
          .filter((i) => i.quantity > 0);
        set({ items });
      },

      setQuantity: (productId, quantity) => {
        const qty = Math.max(1, Number(quantity) || 1);
        set({
          items: get().items.map((i) => {
            if (i.product.id !== productId) return i;
            const maxQty = Number(i.product.stock) || 0;
            return { ...i, quantity: maxQty > 0 ? Math.min(qty, maxQty) : 1 };
          }),
        });
      },

      setItemDiscount: (productId, discount) => {
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, discount: Math.max(0, Number(discount) || 0) } : i
          ),
        });
      },

      remove: (productId) => set({ items: get().items.filter((i) => i.product.id !== productId) }),
      clear: () => set({ items: [], discount: 0, customer: null }),
      setDiscount: (discount) => set({ discount: Math.max(0, Number(discount) || 0) }),
      setCustomer: (customer) => set({ customer }),

      hold: () => {
        const { items, discount, customer } = get();
        if (!items.length) return;
        const held = {
          id: Date.now().toString(36),
          items,
          discount,
          customer,
          heldAt: new Date().toISOString(),
        };
        set({ heldCarts: [...get().heldCarts, held], items: [], discount: 0, customer: null });
      },

      resume: (heldId) => {
        const held = get().heldCarts.find((h) => h.id === heldId);
        if (!held) return;
        set({
          items: held.items,
          discount: held.discount,
          customer: held.customer,
          heldCarts: get().heldCarts.filter((h) => h.id !== heldId),
        });
      },

      removeHeld: (heldId) => set({ heldCarts: get().heldCarts.filter((h) => h.id !== heldId) }),

      totals: () => computeTotals(get().items, get().discount),
      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: 'pos-cart',
    }
  )
);
