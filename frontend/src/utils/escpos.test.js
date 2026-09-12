import { describe, it, expect } from 'vitest';
import { sanitize, buildReceiptLayout, encodeLinesToBytes, buildEscPosReceipt } from './escpos.js';

const baseSale = {
  invoice_number: 'INV-20260910-000001',
  created_at: '2026-09-10T03:00:00.000Z',
  cashier: { username: 'admin', profiles: { full_name: 'Administrator' } },
  customer: { name: 'Budi' },
  items: [
    { id: '1', product: { name: 'Madu TJ' }, quantity: 2, price: 10000, discount: 0, subtotal: 20000 },
    { id: '2', product: { name: 'Mie Sedap' }, quantity: 1, price: 15000, discount: 1000, subtotal: 14000 },
  ],
  subtotal: 34000,
  discount: 0,
  tax: 0,
  additional_cost: 0,
  total: 34000,
  payment_method: 'CASH',
  payments: [{ cash_received: 50000, change_amount: 16000 }],
};

const baseStore = { name: 'Toko Andi', address: 'Jl. Merdeka 1', phone: '08123', npwp: '00.000' };
const pos58 = { receipt_width: '58mm' };
const pos80 = { receipt_width: '80mm' };

describe('sanitize', () => {
  it('mengganti karakter non-ASCII umum', () => {
    expect(sanitize('Madu × 2 — 30%')).toBe('Madu x 2 - 30%');
  });
  it('menangani null/undefined', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
  });
});

describe('buildReceiptLayout', () => {
  it('menggunakan lebar 32 char untuk 58mm', () => {
    const { width } = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    expect(width).toBe(32);
  });
  it('menggunakan lebar 48 char untuk 80mm', () => {
    const { width } = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos80 });
    expect(width).toBe(48);
  });
  it('berisi kop toko, nomor, total, dan ucapan terima kasih', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    expect(texts.some((t) => t.includes('TOKO ANDI'))).toBe(true);
    expect(texts.some((t) => t.includes('INV-20260910-000001'))).toBe(true);
    expect(texts.some((t) => t.includes('TOTAL'))).toBe(true);
    expect(texts.some((t) => t.includes('Terima kasih'))).toBe(true);
  });
  it('menampilkan section hutang bila pembayaran kurang dari total', () => {
    const sale = { ...baseSale, payments: [{ cash_received: 10000 }], customer: { name: 'Budi' } };
    const layout = buildReceiptLayout({ sale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    expect(texts.some((t) => t.includes('SISA HUTANG'))).toBe(true);
    expect(texts.some((t) => t.includes('BELUM LUNAS'))).toBe(true);
  });
  it('semua baris hasil row() tidak melebihi lebar', () => {
    for (const pos of [pos58, pos80]) {
      const { width, lines } = buildReceiptLayout({ sale: baseSale, store: baseStore, pos });
      for (const line of lines) {
        expect(line.text.length).toBeLessThanOrEqual(width);
      }
    }
  });
  it('diskon item dirender rapi (inline jika muat, baris sendiri jika tidak)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const discIdx = texts.findIndex((t) => t.includes('disc'));
    expect(discIdx).toBeGreaterThan(-1);
    const discLine = texts[discIdx];
    // Baris diskon diindentasi & tidak melebihi lebar
    expect(discLine.trim().startsWith('(')).toBe(true);
    expect(discLine.length).toBeLessThanOrEqual(32);
    // Baris di atasnya memuat "1 x Rp 15.000" + subtotal (2 kolom)
    const prev = texts[discIdx - 1];
    expect(prev).toContain('1 x Rp 15.000');
    expect(prev).toContain('Rp 14.000');
  });
  it('garis solid (=) muncul sebelum TOTAL', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const totalIdx = texts.findIndex((t) => t.includes('TOTAL'));
    const solidLine = texts[totalIdx - 1];
    expect(solidLine).toBe('='.repeat(32));
  });
});

describe('encodeLinesToBytes / buildEscPosReceipt', () => {
  it('menghasilkan buffer Uint8Array dengan prefix init ESC @ (1b 40)', () => {
    const bytes = buildEscPosReceipt({ sale: baseSale, store: baseStore, pos: pos58 });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });
  it('mengandung teks struk ter-encode ASCII', () => {
    const bytes = buildEscPosReceipt({ sale: baseSale, store: baseStore, pos: pos58 });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('TOKO ANDI');
    expect(text).toContain('INV-20260910-000001');
    expect(text).toContain('Terima kasih');
  });
  it('berakhir dengan feed + cut', () => {
    const bytes = buildEscPosReceipt({ sale: baseSale, store: baseStore, pos: pos58 });
    const n = bytes.length;
    expect(bytes[n - 4]).toBe(0x1d);
    expect(bytes[n - 3]).toBe(0x56);
  });
  it('encodeLinesToBytes menerapkan style bold pada baris tertentu', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const bytes = encodeLinesToBytes(layout);
    // Baris "TOTAL" di-bold: sequence ESC ! 0x08 (BOLD) muncul setidaknya sekali
    let hasBold = false;
    for (let i = 0; i < bytes.length - 1; i += 1) {
      if (bytes[i] === 0x1b && bytes[i + 1] === 0x21 && bytes[i + 2] === 0x08) {
        hasBold = true;
        break;
      }
    }
    expect(hasBold).toBe(true);
  });
  it('output byte = layout baris-per-baris yang sama dengan preview modal (48mm/80mm)', () => {
    for (const pos of [pos58, pos80]) {
      const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos });
      const bytes = encodeLinesToBytes(layout);
      const encoded = new TextDecoder().decode(bytes);
      // Setiap baris (sudah disanitasi) harus muncul utuh berurutan di byte stream
      let cursor = 0;
      for (const line of layout.lines) {
        const expected = sanitize(line.align === 'center' ? line.text.trim() : line.text).slice(0, layout.width);
        expect(expected.length).toBeLessThanOrEqual(layout.width);
        // Baris non-kosong harus ada persis (tidak boleh terpotong/jorok)
        if (expected.trim()) {
          const idx = encoded.indexOf(expected, cursor);
          expect(idx).toBeGreaterThanOrEqual(cursor);
          cursor = idx + expected.length;
        }
      }
    }
  });
});