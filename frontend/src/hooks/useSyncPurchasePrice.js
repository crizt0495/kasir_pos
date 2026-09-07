import { useEffect, useRef } from 'react';
import { productsApi } from '../api/index.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';

export function useSyncPurchasePrice(items, { delay = 600 } = {}) {
  const timers = useRef(new Map());
  const lastSynced = useRef(new Map());

  useEffect(() => {
    for (const item of items) {
      const cost = Number(item.cost_price);
      if (!item.product_id || !Number.isFinite(cost) || cost < 0) continue;
      if (lastSynced.current.get(item.product_id) === cost) continue;

      const existing = timers.current.get(item.product_id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        try {
          await productsApi.updatePurchasePrice(item.product_id, { purchase_price: cost });
          lastSynced.current.set(item.product_id, cost);
        } catch (e) {
          toast.error(getErrorMessage(e, 'Gagal memperbarui harga beli produk'));
        } finally {
          timers.current.delete(item.product_id);
        }
      }, delay);

      timers.current.set(item.product_id, timer);
    }

    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
    };
  }, [items, delay]);
}
