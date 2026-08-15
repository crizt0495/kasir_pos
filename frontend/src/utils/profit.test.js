import { describe, it, expect } from 'vitest';
import { itemProfit, saleProfit, profitShare } from './profit.js';

describe('itemProfit — Laba Item = (Harga Jual - Harga Beli) × Qty', () => {
  it('menghitung laba dasar', () => {
    expect(itemProfit(15000, 10000, 2)).toBe(10000);
  });

  it('memperhitungkan diskon item', () => {
    // (15000 × 2) - 1000 - (10000 × 2) = 9000
    expect(itemProfit(15000, 10000, 2, 1000)).toBe(9000);
  });

  it('qty 0 menghasilkan laba 0', () => {
    expect(itemProfit(15000, 10000, 0)).toBe(0);
  });
});

describe('saleProfit — Laba Transaksi = total seluruh laba item', () => {
  it('menjumlahkan laba semua item', () => {
    const items = [
      { price: 15000, cost_price: 10000, quantity: 2, discount: 0 }, // 10000
      { price: 5000, cost_price: 3000, quantity: 1, discount: 0 }, // 2000
    ];
    expect(saleProfit(items)).toBe(12000);
  });

  it('keranjang kosong → 0', () => {
    expect(saleProfit([])).toBe(0);
  });
});

describe('profitShare — Nilai 2,5% = Total Laba Pelanggan × 2,5%', () => {
  it('contoh spesifikasi: laba 10.000.000 → 250.000', () => {
    expect(profitShare(10000000)).toBe(250000);
  });

  it('laba 0 → 0', () => {
    expect(profitShare(0)).toBe(0);
  });

  it('pembulatan 2 desimal', () => {
    expect(profitShare(1234)).toBe(30.85); // 1234 × 0,025 = 30,85
  });
});
