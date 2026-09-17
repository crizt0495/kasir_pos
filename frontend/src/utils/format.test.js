import { describe, it, expect } from 'vitest';
import { formatRupiah, formatQty, paymentMethodLabel, initials, formatDateTimeWIB, formatRupiahCard, compactRupiahText, formatRupiahCompact } from './format.js';

describe('formatRupiah', () => {
  it('memformat angka menjadi Rupiah', () => {
    expect(formatRupiah(15000)).toContain('15.000');
  });
  it('menangani null/undefined', () => {
    expect(formatRupiah(null)).toContain('0');
  });
});

describe('formatRupiahCard', () => {
  it('menampilkan penuh untuk angka kecil', () => {
    expect(formatRupiahCard(15000)).toBe(formatRupiah(15000));
    expect(formatRupiahCard(999999)).toContain('999.999');
  });
  it('meringkas angka besar agar muat di kartu', () => {
    expect(formatRupiahCard(1000000)).toBe(formatRupiahCompact(1000000));
    expect(formatRupiahCard(1500000)).toContain('1,5 Jt');
    expect(formatRupiahCard(1234567890)).toContain('1,2 M');
  });
  it('menangani nilai negatif', () => {
    expect(formatRupiahCard(-2500000)).toContain('2,5 Jt');
    expect(formatRupiahCard(-2500000)).toContain('-');
  });
});

describe('compactRupiahText', () => {
  it('meringkas teks Rupiah yang sudah diformat', () => {
    expect(compactRupiahText('Rp\u00A012.345.678')).toContain('12,3 Jt');
    expect(compactRupiahText('-Rp\u00A01.234.567.890')).toContain('1,2 M');
  });
  it('membiarkan teks pendek / non-Rupiah apa adanya', () => {
    expect(compactRupiahText('Rp\u00A0999.999')).toContain('999.999');
    expect(compactRupiahText('12.345')).toBe('12.345');
    expect(compactRupiahText('Halo dunia')).toBe('Halo dunia');
    expect(compactRupiahText(null)).toBe('');
    expect(compactRupiahText('')).toBe('');
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

describe('formatDateTimeWIB', () => {
  it('mengonversi UTC ke WIB (UTC+7)', () => {
    expect(formatDateTimeWIB('2026-09-10T03:00:00.000Z')).toBe('10 Sep 2026, 10:00');
  });
  it('tanggal bergeser saat UTC sudah lewat tengah malam WIB', () => {
    expect(formatDateTimeWIB('2026-09-09T18:30:00.000Z')).toBe('10 Sep 2026, 01:30');
  });
  it('fallback untuk nilai kosong', () => {
    expect(formatDateTimeWIB(null)).toBe('-');
    expect(formatDateTimeWIB('bukan-tanggal')).toBe('-');
  });
});
