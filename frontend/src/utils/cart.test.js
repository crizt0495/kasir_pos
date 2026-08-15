import { describe, it, expect } from 'vitest';
import { computeTotals, computeTax, computeChange, round2 } from './cart.js';

describe('computeTotals', () => {
  it('menghitung subtotal item', () => {
    const items = [
      { product: { sale_price: 10000 }, quantity: 2, discount: 0 },
      { product: { sale_price: 5000 }, quantity: 1, discount: 0 },
    ];
    expect(computeTotals(items).subtotal).toBe(25000);
  });

  it('mengurangi diskon item per baris', () => {
    const items = [{ product: { sale_price: 10000 }, quantity: 2, discount: 2000 }];
    expect(computeTotals(items).subtotal).toBe(18000);
  });

  it('menerapkan diskon transaksi', () => {
    const items = [{ product: { sale_price: 10000 }, quantity: 1, discount: 0 }];
    const totals = computeTotals(items, 1000);
    expect(totals.subtotal).toBe(10000);
    expect(totals.total).toBe(9000);
  });

  it('total = subtotal - diskon + pajak + biaya tambahan', () => {
    const items = [{ product: { sale_price: 100000 }, quantity: 1, discount: 0 }];
    const totals = computeTotals(items, 5000, 11000, 2000);
    expect(totals.total).toBe(108000);
  });

  it('keranjang kosong = nol', () => {
    expect(computeTotals([]).total).toBe(0);
  });
});

describe('computeTax', () => {
  it('pajak 11% dari 100000 = 11000', () => {
    expect(computeTax(100000, 11)).toBe(11000);
  });
  it('pajak 0 jika persentase 0', () => {
    expect(computeTax(100000, 0)).toBe(0);
  });
});

describe('computeChange', () => {
  it('kembalian = bayar - total', () => {
    expect(computeChange(50000, 42000)).toBe(8000);
  });
  it('negatif jika kurang bayar', () => {
    expect(computeChange(10000, 20000)).toBe(-10000);
  });
});

describe('round2', () => {
  it('membulatkan ke 2 desimal', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10.0);
  });
});
