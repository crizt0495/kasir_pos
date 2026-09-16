import { describe, it, expect } from 'vitest';
import {
  isNetworkError,
  filterProductsLocal,
  findProductByCodeLocal,
  filterCustomersLocal,
  buildOfflineInvoiceNumber,
  buildPendingSale,
} from './pure.js';

describe('isNetworkError', () => {
  it('mengenali kegagalan jaringan axios', () => {
    expect(isNetworkError({ isAxiosError: true })).toBe(true);
    expect(isNetworkError({ message: 'Network Error' })).toBe(true);
    expect(isNetworkError({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isNetworkError({ code: 'ECONNABORTED' })).toBe(true);
  });

  it('bukan kegagalan jaringan saat ada respons server', () => {
    expect(isNetworkError({ response: { status: 500 } })).toBe(false);
    expect(isNetworkError({ response: { status: 422 } })).toBe(false);
  });

  it('null/undefined/{} bukan kegagalan jaringan', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError({})).toBe(false);
  });
});

describe('filterProductsLocal', () => {
  const products = [
    { id: '1', name: 'Espresso', sku: 'SKU-001', barcode: '899001', category_id: 'cat1', status: 'active', stock: 5 },
    { id: '2', name: 'es teh manis', sku: 'SKU-002', barcode: '899002', category_id: 'cat1', status: 'active', stock: 0 },
    { id: '3', name: 'Air Mineral', sku: 'SKU-003', barcode: '899003', category_id: 'cat2', status: 'inactive', stock: 10 },
  ];

  it('cari berdasarkan nama (case-insensitive, substring)', () => {
    const res = filterProductsLocal(products, { search: 'es' });
    expect(res.map((p) => p.id)).toEqual(['2', '1']);
  });

  it('cari berdasarkan sku/barcode', () => {
    expect(filterProductsLocal(products, { search: 'SKU-002' }).map((p) => p.id)).toEqual(['2']);
    expect(filterProductsLocal(products, { search: '899003' }).map((p) => p.id)).toEqual(['3']);
  });

  it('filter kategori + sort nama asc + limit', () => {
    const res = filterProductsLocal(products, { categoryId: 'cat1', limit: 1 });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('2');
  });

  it('produk nonaktif tetap ikut (meniru server)', () => {
    expect(filterProductsLocal(products, {}).some((p) => p.status === 'inactive')).toBe(true);
  });

  it('search kosong → semua produk', () => {
    expect(filterProductsLocal(products, {})).toHaveLength(3);
  });
});

describe('findProductByCodeLocal', () => {
  const products = [
    { id: '1', name: 'A', sku: 'SKU-001', barcode: '899001' },
    { id: '2', name: 'B', sku: 'SKU-002', barcode: '899002' },
  ];

  it('klik presisi barcode (lebar/trim tidak masalah)', () => {
    expect(findProductByCodeLocal(products, ' 899001 ').id).toBe('1');
  });

  it('fallback ke SKU', () => {
    expect(findProductByCodeLocal(products, 'sku-002').id).toBe('2');
  });

  it('tidak ditemukan → null', () => {
    expect(findProductByCodeLocal(products, '999999')).toBeNull();
    expect(findProductByCodeLocal(products, '')).toBeNull();
    expect(findProductByCodeLocal([], '899001')).toBeNull();
  });
});

describe('filterCustomersLocal', () => {
  const customers = [
    { id: '1', name: 'Budi', phone: '0812' },
    { id: '2', name: 'Andi', phone: '0813' },
  ];

  it('cari nama atau nomor HP', () => {
    expect(filterCustomersLocal(customers, { search: 'bud' })[0].id).toBe('1');
    expect(filterCustomersLocal(customers, { search: '0813' })[0].id).toBe('2');
  });

  it('sort nama + limit', () => {
    expect(filterCustomersLocal(customers, { limit: 1 })[0].id).toBe('2');
  });
});

describe('buildOfflineInvoiceNumber', () => {
  it('format INV-OFF-YYYYMMDD-HHMMSS', () => {
    const d = new Date(2026, 8, 15, 14, 5, 9);
    expect(buildOfflineInvoiceNumber(d)).toBe('INV-OFF-20260915-140509');
  });

  it('mendukung prefix custom', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(buildOfflineInvoiceNumber(d, 'NOTA')).toBe('NOTA-OFF-20260102-030405');
  });
});

describe('buildPendingSale', () => {
  const cart = {
    items: [
      { product: { id: 'p1', name: 'Kopi', sku: 'K-1', sale_price: 15000, unit: { short_name: 'cx' } }, quantity: 2, discount: 0 },
      { product: { id: 'p2', name: 'Teh', sku: 'T-1', sale_price: 8000, unit: null }, quantity: 1, discount: 1000 },
    ],
    discount: 2000,
    customer: { id: 'c1', name: 'Budi' },
  };
  const payload = {
    payment_method: 'CASH',
    cash_received: 50000,
    notes: 'test',
    tax: 0,
    additional_cost: 0,
    customer_id: 'c1',
    session_id: 's1',
    discount: 2000,
    items: [],
  };
  const totals = { subtotal: 38000, discount: 2000, tax: 0, additional_cost: 0, total: 36000 };
  const user = { username: 'kasir1', profile: { full_name: 'Kasir Satu' } };

  const record = buildPendingSale({ cart, payload, totals, user, offlineId: 'off-1' });

  it('struktur record pending', () => {
    expect(record.offline_id).toBe('off-1');
    expect(record.is_pending).toBe(true);
    expect(record.created_at).toBeTruthy();
  });

  it('payload ulang (replay) sama persis untuk sinkronisasi', () => {
    expect(record.payload).toBe(payload);
    expect(record.payload.customer_id).toBe('c1');
    expect(record.payload.session_id).toBe('s1');
    expect(record.payload.discount).toBe(2000);
  });

  it('item sale lengkap dengan subtotal & unit', () => {
    expect(record.sale.items).toHaveLength(2);
    expect(record.sale.items[0]).toMatchObject({
      product: { id: 'p1', name: 'Kopi', sku: 'K-1', unit: { short_name: 'cx' } },
      quantity: 2,
      price: 15000,
      subtotal: 30000,
    });
    expect(record.sale.items[1].subtotal).toBe(7000);
  });

  it('total & pembayaran cash', () => {
    expect(record.sale.total).toBe(36000);
    expect(record.sale.cashier).toEqual({ username: 'kasir1', profiles: { full_name: 'Kasir Satu' } });
    expect(record.sale.customer).toEqual(cart.customer);
    expect(record.sale.payments[0]).toEqual({ cash_received: 50000, change_amount: 14000 });
    expect(record.sale.is_offline).toBe(true);
  });

  it('invoice number offline (bukan nomor server)', () => {
    expect(record.sale.invoice_number).toMatch(/^INV-OFF-\d{8}-\d{6}$/);
  });
});