import { describe, it, expect } from 'vitest';
import { formatRupiah, formatQty, paymentMethodLabel, initials } from './format.js';

describe('formatRupiah', () => {
  it('memformat angka menjadi Rupiah', () => {
    expect(formatRupiah(15000)).toContain('15.000');
  });
  it('menangani null/undefined', () => {
    expect(formatRupiah(null)).toContain('0');
  });
});

describe('formatQty', () => {
  it('tanpa desimal jika bulat', () => {
    expect(formatQty(5)).toBe('5');
  });
  it('dengan desimal jika pecahan', () => {
    expect(formatQty(5.5)).toBe('5,5');
  });
});

describe('paymentMethodLabel', () => {
  it('menerjemahkan kode metode', () => {
    expect(paymentMethodLabel('CASH')).toBe('Tunai');
    expect(paymentMethodLabel('QRIS')).toBe('QRIS');
    expect(paymentMethodLabel('TRANSFER')).toBe('Transfer');
  });
  it('fallback ke kode asli', () => {
    expect(paymentMethodLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('initials', () => {
  it('mengambil inisial nama', () => {
    expect(initials('Budi Santoso')).toBe('BS');
  });
  it('fallback untuk nama kosong', () => {
    expect(initials('')).toBe('?');
  });
});
