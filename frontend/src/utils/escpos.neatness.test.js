import { describe, it, expect } from 'vitest';
import { buildReceiptLayout, scoreReceiptLayout, sanitize, encodeLinesToBytes } from './escpos.js';

const store = { name: 'TOKO ANDI', address: 'Jl. Ahmad Yani No. 45', phone: '0812-3456-7890', npwp: '45.678.901.2-345.000' };
const pos58 = { receipt_width: '58mm' };
const pos80 = { receipt_width: '80mm' };

const baseSale = {
  invoice_number: 'INV-20260912-000123',
  created_at: '2026-09-12T10:25:00.000Z',
  cashier: { username: 'kasir1', profiles: { full_name: 'Budi Santoso' } },
  customer: { name: 'PT Maju Jaya' },
  items: [
    { product: { name: 'Kopi Susu Gula Aren' }, quantity: 2, price: 27000, subtotal: 54000, discount: 0 },
    { product: { name: 'Roti Bakar Coklat Keju' }, quantity: 1, price: 18000, subtotal: 18000, discount: 0 },
    { product: { name: 'Indomie Goreng Spesial Telur Ayam Kampung' }, quantity: 3, price: 15500, subtotal: 46500, discount: 2000 },
  ],
  subtotal: 118500,
  discount: 2000,
  tax: 1250,
  total: 117750,
  payment_method: 'CASH',
  payments: [{ cash_received: 120000, change_amount: 2250 }],
};

describe('scoreReceiptLayout', () => {
  it('kerapian 100/100 untuk 58mm & 80mm', () => {
    for (const pos of [pos58, pos80]) {
      const layout = buildReceiptLayout({ sale: baseSale, store, pos });
      const { score, issues } = scoreReceiptLayout(layout);
      expect(score, `issue: ${issues.map((i) => i.type).join(', ')}`).toBe(100);
    }
  });

  it('titik dua blok info sejajar (kolom sejajar)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const colons = layout.lines
      .map((l) => l.text)
      .filter((t) => /^(No\.|Tanggal|Kasir|Pelanggan)/.test(t))
      .map((t) => t.indexOf(':'));
    expect(new Set(colons).size).toBe(1);
    expect(colons[0]).toBe(10);
  });

  it('nilai uang & header Subtotal rata kanan sampai tepi kolom', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const header = layout.lines.find((l) => l.style === 'bold' && /Subtotal/.test(l.text));
    expect(header.text.endsWith('Subtotal')).toBe(true);
    expect(header.text.length).toBe(32);
  });

  it('mendeteksi layout yang berantakan (skor < 100)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    layout.lines.push({ text: 'Rp 5.000           ' }); // kolom nilai tidak mentok kanan
    const { score } = scoreReceiptLayout(layout);
    expect(score).toBeLessThan(100);
  });
});

describe('encodeLinesToBytes — tidak dobel center', () => {
  it('baris tengah dikirim apa adanya + ESC a 1 (bukan di-pad manual)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const bytes = encodeLinesToBytes(layout);
    const encoded = new TextDecoder().decode(bytes);

    // Teks tengah tidak boleh diawali spasi pad di byte stream — printer
    // yang memusatkan via ESC a 1 (jika kita pad manual, hasilnya geser kanan).
    const centerLines = layout.lines.filter((l) => l.align === 'center');
    for (const line of centerLines) {
      const needle = sanitize(line.text.trim());
      if (!needle) continue;
      const idx = encoded.indexOf(needle);
      expect(idx).toBeGreaterThan(-1);
      // Karakter sebelum teks tidak boleh spasi (harus langsung align cmd / tidak ada pad)
      const before = encoded[idx - 1];
      expect(before === ' ' ? { before, msg: 'baris tengah ke-pad manual' } : undefined).toBeUndefined();
    }
  });

  it('teks berurutan di byte = teks layout (item & total)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const bytes = encodeLinesToBytes(layout);
    const encoded = new TextDecoder().decode(bytes);
    const texts = layout.lines.map((l) => l.text);
    expect(encoded).toContain('Item');
    expect(encoded).toContain('Kopi Susu Gula Aren');
    expect(encoded).toContain('TOTAL');
    expect(encoded).toContain('Terima kasih');
    expect(texts.every((t) => t.length <= layout.width)).toBe(true);
  });
});