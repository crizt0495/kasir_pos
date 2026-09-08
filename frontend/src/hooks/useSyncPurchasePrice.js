import { productsApi } from '../api/index.js';

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