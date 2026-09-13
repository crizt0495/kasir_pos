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
  it('semua baris hasil build tidak melebihi lebar', () => {
    for (const pos of [pos58, pos80]) {
      const { width, lines } = buildReceiptLayout({ sale: baseSale, store: baseStore, pos });
      for (const line of lines) {
        expect(line.text.length).toBeLessThanOrEqual(width);
      }
    }
  });

  it('header item menampilkan kolom Qty, Harga, dan Subtotal (4 kolom)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const header = layout.lines.find((l) => l.style === 'bold' && /^Item/.test(l.text));
    expect(header.text.startsWith('Item')).toBe(true);
    expect(header.text).toContain('Qty');
    expect(header.text).toContain('Harga');
    expect(header.text.endsWith('Subtotal')).toBe(true);
  });

  it('nama produk di baris sendiri (bold), qty/harga/subtotal di baris nilai rata kanan', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    // Tidak ada lagi qty inline ("2x Nama")
    expect(texts.some((t) => /^\d+x /.test(t))).toBe(false);
    // Nama produk muncul sebagai baris bold tersendiri
    const nameLine = layout.lines.find((l) => l.style === 'bold' && l.text === 'Madu TJ');
    expect(nameLine).toBeTruthy();
    // Baris nilai: Qty 2, Harga 10.000, Subtotal 20.000 — rata kanan
    const valueRow = texts.find((t) => /^\s+\d+\s+10\.000\s+20\.000$/.test(t));
    expect(valueRow).toBeTruthy();
    expect(valueRow.endsWith('20.000')).toBe(true);
    expect(valueRow.length).toBe(32);
  });

  it('menampilkan baris satuan/varian di bawah nama produk', () => {
    const sale = {
      ...baseSale,
      items: [{ ...baseSale.items[0], product: { name: 'Kopi Kapal Api', unit: { name: 'Gram', short_name: 'gr' } } }],
    };
    const layout = buildReceiptLayout({ sale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const nameIdx = texts.indexOf('Kopi Kapal Api');
    expect(nameIdx).toBeGreaterThan(-1);
    expect(texts[nameIdx + 1]).toBe('gr');
    expect(texts[nameIdx + 2]).toMatch(/^\s+\d+\s+10\.000\s+20\.000$/);
  });

  it('diskon item dirender sebagai catatan di bawah baris nilai item', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const discIdx = texts.findIndex((t) => t.includes('disc'));
    expect(discIdx).toBeGreaterThan(-1);
    expect(texts[discIdx].trim().startsWith('(')).toBe(true);
    // Baris nilai item tepat di atasnya: subtotal 14.000 mentok kanan
    const valueRow = texts[discIdx - 1];
    expect(valueRow.endsWith('14.000')).toBe(true);
    expect(valueRow.length).toBe(32);
    // Nama produk (bold) ada di atas baris nilai
    const nameRow = layout.lines[discIdx - 2];
    expect(nameRow.text).toBe('Mie Sedap');
    expect(nameRow.style).toBe('bold');
  });

  it('baris bawah memakai JUMLAH ITEM (bukan Subtotal) + ada blank sebelum terima kasih', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    // Tidak ada lagi baris yang diawali "Subtotal" (label bawah dihapus)
    expect(texts.some((t) => /^Subtotal/.test(t))).toBe(false);
    // JUMLAH ITEM : 3 (total qty 2 + 1)
    expect(texts.some((t) => /^JUMLAH ITEM\s*:\s*3$/.test(t))).toBe(true);
    // TOTAL tetap ada (dengan titik dua)
    expect(texts.some((t) => /^TOTAL\s*:\s*Rp 34.000$/.test(t))).toBe(true);
    // Blank line sebelum "Terima kasih"
    const thanksIdx = texts.findIndex((t) => t.startsWith('Terima kasih'));
    expect(thanksIdx).toBeGreaterThan(-1);
    expect(texts[thanksIdx - 1]).toBe('');
    expect(texts[thanksIdx - 2]).toBe('-'.repeat(32));
  });

  it('show_unit_price=false menghilangkan kolom Harga (tetap Item/Qty/Subtotal)', () => {
    const layout = buildReceiptLayout({
      sale: baseSale,
      store: baseStore,
      pos: { ...pos58, show_unit_price: false },
    });
    const header = layout.lines.find((l) => l.style === 'bold' && /^Item/.test(l.text));
    expect(header.text).not.toContain('Harga');
    expect(header.text).toContain('Qty');
    expect(header.text.endsWith('Subtotal')).toBe(true);
    // Baris nilai tetap memuat subtotal mentok kanan
    const valueRows = layout.lines.map((l) => l.text).filter((t) => /^\s{4,}\d/.test(t) && /\d$/.test(t));
    expect(valueRows.every((t) => t.endsWith('20.000') || t.endsWith('14.000'))).toBe(true);
  });

  it('garis solid (=) muncul sebelum TOTAL', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const totalIdx = texts.findIndex((t) => /^TOTAL/.test(t));
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
    expect(text).toContain('JUMLAH ITEM');
  });
  it('mengunci font standar (ESC M 0) + ukuran normal (GS ! 0) di awal stream', () => {
    const bytes = buildEscPosReceipt({ sale: baseSale, store: baseStore, pos: pos58 });
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x4d);
    expect(bytes[4]).toBe(0x00);
    expect(bytes[5]).toBe(0x1d);
    expect(bytes[6]).toBe(0x21);
    expect(bytes[7]).toBe(0x00);
    expect(bytes[8]).toBe(0x1b);
    expect(bytes[9]).toBe(0x61);
    expect(bytes[10]).toBe(0x00);
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
    let hasBold = false;
    for (let i = 0; i < bytes.length - 1; i += 1) {
      if (bytes[i] === 0x1b && bytes[i + 1] === 0x21 && bytes[i + 2] === 0x08) {
        hasBold = true;
        break;
      }
    }
    expect(hasBold).toBe(true);
  });
  it('cetak = modal: tidak ada double-height (ESC ! 0x18) sehingga nama toko sama ukurannya dengan modal', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const bytes = encodeLinesToBytes(layout);
    let hasDoubleHeight = false;
    for (let i = 0; i < bytes.length - 2; i += 1) {
      if (bytes[i] === 0x1b && bytes[i + 1] === 0x21 && bytes[i + 2] === 0x18) {
        hasDoubleHeight = true;
        break;
      }
    }
    expect(hasDoubleHeight).toBe(false);
  });
  it('output byte = layout baris-per-baris yang sama dengan preview modal (48mm/80mm)', () => {
    for (const pos of [pos58, pos80]) {
      const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos });
      const bytes = encodeLinesToBytes(layout);
      const encoded = new TextDecoder().decode(bytes);
      let cursor = 0;
      for (const line of layout.lines) {
        const expected = sanitize(line.align === 'center' ? line.text.trim() : line.text).slice(0, layout.width);
        expect(expected.length).toBeLessThanOrEqual(layout.width);
        if (expected.trim()) {
          const idx = encoded.indexOf(expected, cursor);
          expect(idx).toBeGreaterThanOrEqual(cursor);
          cursor = idx + expected.length;
        }
      }
    }
  });
});