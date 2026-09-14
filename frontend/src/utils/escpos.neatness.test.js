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
    { product: { name: 'Indomie Goreng Spesial Telur Ayam Kampung', unit: { name: 'Gram', short_name: 'gr' } }, quantity: 3, price: 15500, subtotal: 46500, discount: 2000 },
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

  it('header kolom item hanya di mode tanpa satuan (Subtotal di ujung kanan)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: { ...pos58, show_satuan: false } });
    const header = layout.lines.find((l) => l.style === 'bold' && /^Item/.test(l.text));
    expect(header.text.endsWith('Subtotal')).toBe(true);
    expect(header.text.length).toBe(32);
  });

  it('baris nilai item & ringkasan rapi (2 baris per produk + total qty di bawah)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    // Total qty = 2 + 1 + 3 = 6 ditampilkan di kolom bawah (tanpa JUMLAH ITEM)
    expect(texts.some((t) => /^JUMLAH ITEM/.test(t))).toBe(false);
    expect(texts.some((t) => /^\s{4,}6\s+118\.500$/.test(t))).toBe(true);
    // Baris nilai satuan: "satuan kiri, qty/harga/subtotal rata kanan"
    expect(texts.some((t) => /^\s+3 gr\s+15\.500\s+46\.500$/.test(t))).toBe(true);
    expect(texts.some((t) => /^\s{4,}2\s+27\.000\s+54\.000$/.test(t))).toBe(true);
    // Tidak ada lagi baris detail "@ harga" (harga kini satu kolom nilai)
    expect(texts.some((t) => t.trim() === '@ 27.000')).toBe(false);
    // Semua baris nilai item diakhiri angka, mentok kanan, panjang penuh
    const valueRowPattern = /^\s{4,}.*\d{1,3}(\.\d{3})+$/;
    for (const t of texts) {
      if (valueRowPattern.test(t) && /\d$/.test(t)) {
        expect(t.length).toBe(32);
        expect(t.endsWith(' ')).toBe(false);
      }
    }
  });

  it('mendeteksi layout yang berantakan (skor < 100)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    // Baris nilai tidak mentok kanan → money-align (skor turun)
    layout.lines.push({ text: '    1  10.000' });
    const { score } = scoreReceiptLayout(layout);
    expect(score).toBeLessThan(100);
  });

  it('show_unit_price=false tetap rapih 100/100', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: { ...pos58, show_unit_price: false } });
    const { score, issues } = scoreReceiptLayout(layout);
    expect(score, `issue: ${issues.map((i) => i.type).join(', ')}`).toBe(100);
  });
});

describe('encodeLinesToBytes — tidak dobel center', () => {
  it('baris tengah dikirim apa adanya + ESC a 1 (bukan di-pad manual)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const bytes = encodeLinesToBytes(layout);
    const encoded = new TextDecoder().decode(bytes);

    const centerLines = layout.lines.filter((l) => l.align === 'center');
    for (const line of centerLines) {
      const needle = sanitize(line.text.trim());
      if (!needle) continue;
      const idx = encoded.indexOf(needle);
      expect(idx).toBeGreaterThan(-1);
      const before = encoded[idx - 1];
      expect(before === ' ' ? { before, msg: 'baris tengah ke-pad manual' } : undefined).toBeUndefined();
    }
  });

  it('teks berurutan di byte = teks layout (item & total)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store, pos: pos58 });
    const bytes = encodeLinesToBytes(layout);
    const encoded = new TextDecoder().decode(bytes);
    const texts = layout.lines.map((l) => l.text);
    expect(encoded).toContain('Kopi Susu Gula');
    expect(encoded).toContain('Roti Bakar');
    expect(encoded).toContain('TOTAL');
    expect(encoded).toContain('Terima kasih');
    expect(texts.every((t) => t.length <= layout.width)).toBe(true);
  });
});