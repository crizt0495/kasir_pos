import { describe, expect, it, vi, beforeEach } from 'vitest';
import { syncPurchasePrices } from './useSyncPurchasePrice.js';

vi.mock('../api/index.js', () => ({
  productsApi: {
    updatePurchasePrice: vi.fn(),
  },
}));

vi.mock('../api/client.js', () => ({
  getErrorMessage: (e) => e?.message || 'terjadi kesalahan',
}));

vi.mock('../stores/uiStore.js', () => ({
  toast: { error: vi.fn() },
}));

import { productsApi } from '../api/index.js';
import { getErrorMessage } from '../api/client.js';
import { toast } from '../stores/uiStore.js';

describe('syncPurchasePrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productsApi.updatePurchasePrice.mockResolvedValue({ data: { id: 'p1' } });
  });

  it('memperbarui harga beli tiap item valid', async () => {
    const items = [
      { product_id: 'p1', cost_price: 10000 },
      { product_id: 'p2', cost_price: 2500 },
    ];
    const synced = await syncPurchasePrices(items);

    expect(productsApi.updatePurchasePrice).toHaveBeenCalledTimes(2);
    expect(productsApi.updatePurchasePrice).toHaveBeenCalledWith('p1', { purchase_price: 10000 });
    expect(productsApi.updatePurchasePrice).toHaveBeenCalledWith('p2', { purchase_price: 2500 });
    expect(synced).toEqual(['p1', 'p2']);
  });

  it('melewati item tanpa product_id, harga negatif, atau harga tak valid', async () => {
    const items = [
      { product_id: null, cost_price: 10000 },
      { product_id: 'p2', cost_price: -5 },
      { product_id: 'p3', cost_price: 'abc' },
      { product_id: 'p4', cost_price: 0 },
    ];
    const synced = await syncPurchasePrices(items);

    expect(productsApi.updatePurchasePrice).toHaveBeenCalledTimes(1);
    expect(productsApi.updatePurchasePrice).toHaveBeenCalledWith('p4', { purchase_price: 0 });
    expect(synced).toEqual(['p4']);
  });

  it('tidak gagal saat API error, memanggil onError dan mengecualikan produk dari hasil', async () => {
    productsApi.updatePurchasePrice.mockRejectedValueOnce(new Error('diskon tidak valid')).mockResolvedValueOnce({ data: {} });
    const onError = vi.fn();
    const items = [
      { product_id: 'p1', cost_price: 10000 },
      { product_id: 'p2', cost_price: 2000 },
    ];
    const synced = await syncPurchasePrices(items, { onError });

    expect(productsApi.updatePurchasePrice).toHaveBeenCalledTimes(2);
    expect(synced).toEqual(['p2']);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});