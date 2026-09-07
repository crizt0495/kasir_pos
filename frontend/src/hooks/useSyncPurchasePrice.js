import { useCallback, useEffect, useRef } from 'react';
import { productsApi } from '../api/index.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';

export async function syncPurchasePrices(items, { onError } = {}) {
  const synced = [];
  for (const item of items) {
    const cost = Number(item.cost_price);
    if (!item.product_id || !Number.isFinite(cost) || cost < 0) continue;
    try {
      await productsApi.updatePurchasePrice(item.product_id, { purchase_price: cost });
      synced.push(item.product_id);
    } catch (e) {
      if (onError) onError(e);
    }
  }
  return synced;
}

export function useSyncPurchasePrice(items, { delay = 600 } = {}) {
  const timers = useRef(new Map());
  const lastSynced = useRef(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    for (const item of items) {
      const cost = Number(item.cost_price);
      if (!item.product_id || !Number.isFinite(cost) || cost < 0) continue;
      if (lastSynced.current.get(item.product_id) === cost) continue;

      const existing = timers.current.get(item.product_id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        try {
          const synced = await syncPurchasePrices([item], {
            onError: (e) => toast.error(getErrorMessage(e, 'Gagal memperbarui harga beli produk')),
          });
          if (synced.length) lastSynced.current.set(item.product_id, cost);
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

  const flush = useCallback(async () => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    const pending = itemsRef.current.filter((item) => {
      const cost = Number(item.cost_price);
      return item.product_id && Number.isFinite(cost) && cost >= 0 && lastSynced.current.get(item.product_id) !== cost;
    });
    const synced = await syncPurchasePrices(pending, {
      onError: (e) => toast.error(getErrorMessage(e, 'Gagal memperbarui harga beli produk')),
    });
    for (const pid of synced) {
      const item = itemsRef.current.find((i) => i.product_id === pid);
      if (item) lastSynced.current.set(pid, Number(item.cost_price));
    }
  }, []);

  return flush;
}