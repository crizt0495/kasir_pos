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

  it('header item menampilkan kolom Item, Qty, dan Subtotal', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const header = layout.lines.find((l) => l.style === 'bold' && /^Item/.test(l.text));
    expect(header.text.startsWith('Item')).toBe(true);
    expect(header.text).toContain('Qty');
    expect(header.text.endsWith('Subtotal')).toBe(true);
    expect(header.text).not.toContain('Harga');
    expect(header.text.length).toBe(32);
  });

  it('item satu baris lurus: nama kiri + qty/subtotal rata kanan sejajar header', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const header = layout.lines.find((l) => l.style === 'bold' && /^Item/.test(l.text));

    // Tidak ada lagi qty inline ("2x Nama")
    expect(texts.some((t) => /^\d+x /.test(t))).toBe(false);
    // Satu baris per item: nama + qty + subtotal
    const mainRow = texts.find((t) => /^Madu TJ\s+\d+\s+20\.000$/.test(t));
    expect(mainRow).toBeTruthy();
    expect(mainRow.endsWith('20.000')).toBe(true);
    expect(mainRow.length).toBe(32);
    // Qty & Subtotal semua item rata kanan ke kolom yang sama dengan header
    const itemRowPattern = /^[A-Za-z][\w .,'-]*\s+\d{1,3}\s+\d{1,3}(\.\d{3})+$/;
    for (const t of texts) {
      if (itemRowPattern.test(t)) {
        const subtotal = t.match(/\d{1,3}(\.\d{3})+$/)[0];
        expect(t.endsWith('20.000') || t.endsWith('14.000')).toBe(true);
        expect(t.lastIndexOf(subtotal) + subtotal.length).toBe(
          header.text.lastIndexOf('Subtotal') + 'Subtotal'.length
        );
      }
    }
  });

  it('harga satuan dirender sebagai baris detail (@ harga) di bawah item', () => {
    const sale = {
      ...baseSale,
      items: [{ ...baseSale.items[0], product: { name: 'Kopi Kapal Api', unit: { name: 'Gram', short_name: 'gr' } } }],
    };
    const layout = buildReceiptLayout({ sale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    // Satuan tidak lagi tercetak sebagai baris terpisah
    expect(texts.some((t) => t.trim() === 'gr')).toBe(false);
    // Baris utama masih satu baris lurus dengan subtotal
    expect(texts.some((t) => /^Kopi Kapal Api\s+\d+\s+20\.000$/.test(t))).toBe(true);
    // Detail harga satuan muncul di bawahnya
    expect(texts.some((t) => t.trim() === '@ 10.000')).toBe(true);
  });

  it('diskon item dirender sebagai catatan di bawah baris detail harga', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const discIdx = texts.findIndex((t) => t.includes('disc'));
    expect(discIdx).toBeGreaterThan(-1);
    expect(texts[discIdx].trim().replace(/\u00a0/g, ' ')).toBe('disc -Rp 1.000');
    // Baris detail harga tepat di atasnya, lalu baris utama item (subtotal mentok kanan)
    expect(texts[discIdx - 1].trim()).toBe('@ 15.000');
    expect(texts[discIdx - 2].endsWith('14.000')).toBe(true);
    expect(texts[discIdx - 2].length).toBe(32);
  });

  it('baris bawah memakai JUMLAH ITEM (bukan Subtotal)', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    // Tidak ada lagi baris yang diawali "Subtotal" (label bawah dihapus)
    expect(texts.some((t) => /^Subtotal/.test(t))).toBe(false);
    // JUMLAH ITEM : 3 (total qty 2 + 1)
    expect(texts.some((t) => /^JUMLAH ITEM\s*:\s*3$/.test(t))).toBe(true);
    // TOTAL tetap ada (dengan titik dua)
    expect(texts.some((t) => /^TOTAL\s*:\s*Rp 34.000$/.test(t))).toBe(true);
  });

  it('footer default (tanpa setting) memakai "Terima kasih" di baris paling bawah', () => {
    const layout = buildReceiptLayout({ sale: baseSale, store: baseStore, pos: pos58 });
    const texts = layout.lines.map((l) => l.text);
    const footerIdx = texts.findIndex((t) => t.startsWith('Terima kasih'));
    expect(footerIdx).toBeGreaterThan(-1);
    expect(texts[footerIdx]).toBe('Terima kasih atas kunjungan');
    expect(texts[footerIdx + 1]).toBe('Anda!');
    expect(texts[footerIdx + 1]).toBe(texts[texts.length - 1]);
    expect(texts[footerIdx - 1]).toBe('');
    expect(texts[footerIdx - 2]).toMatch(/^-+$/);
    expect(texts.some((t) => t.includes('dikembalikan'))).toBe(false);
  });

  it('footer_nota custom dirender di paling bawah & mendukung multi-baris', () => {
    const layout = buildReceiptLayout({
      sale: baseSale,
      store: baseStore,
      pos: { ...pos58, footer_nota: 'Dilarang keras merokok\nTerima kasih atas kunjungan Anda!' },
    });
    const texts = layout.lines.map((l) => l.text);
    expect(texts.slice(-4)).toEqual(['', 'Dilarang keras merokok', 'Terima kasih atas kunjungan', 'Anda!']);
  });

  it('show_footer_nota=false menghilangkan seluruh footer (termasuk kebijakan retur hardcode)', () => {
    const layout = buildReceiptLayout({
      sale: baseSale,
      store: baseStore,
      pos: { ...pos58, show_footer_nota: false, footer_nota: 'Terima kasih' },
    });
    const texts = layout.lines.map((l) => l.text);
    expect(texts.some((t) => t.includes('Terima kasih'))).toBe(false);
    expect(texts.some((t) => t.includes('dikembalikan'))).toBe(false);
    const lastNonEmpty = texts.filter((t) => t.trim() !== '').pop();
    expect(lastNonEmpty.includes('Terima kasih')).toBe(false);
    expect(lastNonEmpty.includes('dikembalikan')).toBe(false);
  });

  it('footer_nota kosong (eksplisit "") tidak mencetak footer', () => {
    const layout = buildReceiptLayout({
      sale: baseSale,
      store: baseStore,
      pos: { ...pos58, footer_nota: '' },
    });
    const texts = layout.lines.map((l) => l.text);
    expect(texts.some((t) => t.includes('Terima kasih'))).toBe(false);
    expect(texts.some((t) => t.includes('dikembalikan'))).toBe(false);
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