import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPagination, buildPage } from '../src/utils/pagination.js';
import { toCsv } from '../src/utils/csv.js';
import { extractPgMessage } from '../src/utils/errors.js';
import { safeSearch } from '../src/utils/sanitize.js';

describe('pagination', () => {
  it('default page 1 size 20', () => {
    const p = getPagination({});
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 20);
    assert.equal(p.from, 0);
    assert.equal(p.to, 19);
  });

  it('membaca page & pageSize dari query', () => {
    const p = getPagination({ page: '3', pageSize: '10' });
    assert.equal(p.page, 3);
    assert.equal(p.pageSize, 10);
    assert.equal(p.from, 20);
    assert.equal(p.to, 29);
  });

  it('memaksa page minimal 1', () => {
    assert.equal(getPagination({ page: '0' }).page, 1);
  });

  it('membatasi pageSize maksimum', () => {
    assert.equal(getPagination({ pageSize: '1000' }, 20, 100).pageSize, 100);
  });

  it('buildPage menghitung totalPages', () => {
    const page = buildPage([1, 2], 42, 2, 20);
    assert.equal(page.total, 42);
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 20);
    assert.equal(page.totalPages, 3);
  });
});

describe('csv', () => {
  const rows = [
    { name: 'Indomie; Goreng', qty: 2, price: 3500 },
    { name: 'Teh Botol', qty: 1, price: 5000 },
  ];
  const csv = toCsv(rows, [
    { key: 'name', label: 'Produk' },
    { key: 'qty', label: 'Qty' },
    { key: 'price', label: 'Harga' },
  ]);

  it('menyertakan header', () => {
    assert.ok(csv.includes('Produk;Qty;Harga'));
  });
  it('meng-escape sel dengan separator', () => {
    assert.ok(csv.includes('"Indomie; Goreng"'));
  });
  it('memiliki BOM UTF-8 agar terbuka di Excel', () => {
    assert.equal(csv.charCodeAt(0), 0xfeff);
  });
});

describe('safeSearch (anti-injeksi string filter PostgREST)', () => {
  it('membiarkan kata pencarian biasa', () => {
    assert.equal(safeSearch('kopi kapal'), 'kopi kapal');
  });
  it('menetralkan koma (pemisah filter .or())', () => {
    assert.equal(safeSearch('a,b'), 'a b');
  });
  it('menetralkan kurung & kutip', () => {
    const out = safeSearch('x),"y');
    // properti penting: tidak ada karakter struktural filter yang tersisa
    assert.ok(!/[(),"]/.test(out));
  });
  it('menetralkan backslash', () => {
    assert.equal(safeSearch('a\\b'), 'a b');
  });
  it('membatasi panjang maksimum', () => {
    assert.ok(safeSearch('a'.repeat(500)).length <= 100);
  });
  it('menangani null/undefined', () => {
    assert.equal(safeSearch(null), '');
    assert.equal(safeSearch(undefined), '');
  });
  it('membuang karakter kontrol', () => {
    assert.equal(safeSearch('a\u0000b\u001f'), 'a b');
  });
});

describe('extractPgMessage', () => {
  it('mengambil pesan utama dari error RPC', () => {
    const err = { message: 'Stok tidak mencukupi untuk Kopi (sisa 3)\nCONTEXT: PL/pgSQL function fn_create_sale' };
    assert.equal(extractPgMessage(err), 'Stok tidak mencukupi untuk Kopi (sisa 3)');
  });
  it('menghapus prefix P0001', () => {
    assert.equal(extractPgMessage({ message: 'P0001 Keranjang tidak boleh kosong' }), 'Keranjang tidak boleh kosong');
  });
  it('fallback untuk error kosong', () => {
    assert.equal(extractPgMessage(null), 'Terjadi kesalahan');
  });
});
