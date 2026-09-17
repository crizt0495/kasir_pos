//
// Katalog offline — menyalin data products/categories/customers ke IndexedDB
// saat internet tersedia, lalu menyediakan pembacaan offline.
//
import { productsApi, categoriesApi, customersApi } from '../api/index.js';
import { putAll, getAll, setMeta, clearStore, getMeta } from './db.js';
import { filterProductsLocal, findProductByCodeLocal, filterCustomersLocal } from './pure.js';

const PAGE_SIZE = 250;
const MAX_PRODUCT_PAGES = 20;
const MAX_CUSTOMER_PAGES = 10;
const KEY_SEEDED = 'catalog_seeded_at';
const KEY_CUSTOMERS_SYNCED = 'customers_synced_at';

async function fetchAllProducts() {
  const out = [];
  const first = await productsApi.list({ page: 1, pageSize: PAGE_SIZE, sort: 'name' });
  const firstData = first.data || {};
  const total = Number(firstData.total ?? firstData.items?.length ?? 0);
  const totalPages = Math.min(
    Number(firstData.totalPages) || Math.ceil(total / PAGE_SIZE) || 1,
    MAX_PRODUCT_PAGES
  );
  out.push(...(firstData.items || []));
  for (let page = 2; page <= totalPages; page += 1) {
    const r = await productsApi.list({ page, pageSize: PAGE_SIZE, sort: 'name' });
    out.push(...((r.data?.items) || []));
  }
  return out;
}

async function fetchAllCustomers() {
  const out = [];
  const first = await customersApi.list({ page: 1, pageSize: PAGE_SIZE });
  const firstData = first.data || {};
  const total = Number(firstData.total ?? firstData.items?.length ?? 0);
  const totalPages = Math.min(
    Number(firstData.totalPages) || Math.ceil(total / PAGE_SIZE) || 1,
    MAX_CUSTOMER_PAGES
  );
  out.push(...(firstData.items || []));
  for (let page = 2; page <= totalPages; page += 1) {
    const r = await customersApi.list({ page, pageSize: PAGE_SIZE });
    out.push(...((r.data?.items) || []));
  }
  return out;
}

/**
 * Seed (atau reseed) katalog produk/kategori/pelanggan ke IndexedDB.
 * Dipanggil saat masuk POS dalam keadaan online & setelah reconnect.
 * Error dikembalikan (tidak dilempar) supaya alur UI tidak pecah.
 */
export async function seedOfflineCatalog() {
  try {
    const [products, categoriesRes, customers, generalRes] = await Promise.all([
      fetchAllProducts(),
      categoriesApi.list({ status: 'active' }),
      fetchAllCustomers(),
      customersApi.list({ is_general: 'true', pageSize: 1 }),
    ]);
    const categories = categoriesRes?.data?.items || [];
    const generalCustomers = generalRes?.data?.items?.[0] || null;
    const customerRows = generalCustomers ? [...customers, generalCustomers] : customers;
    await Promise.all([
      clearStore('products').then(() => putAll('products', products)),
      clearStore('categories').then(() => putAll('categories', categories)),
      clearStore('customers').then(() => putAll('customers', customerRows)),
    ]);
    await setMeta(KEY_SEEDED, new Date().toISOString());
    await setMeta(KEY_CUSTOMERS_SYNCED, new Date().toISOString());
    return { products: products.length, categories: categories.length, customers: customerRows.length };
  } catch (error) {
    return { error };
  }
}

/**
 * Sinkronkan ulang tabel pelanggan di IndexedDB dari API.
 * Dipesan dipanggil saat: buka POS dalam keadaan online, setelah transaksi
 * hutang baru berhasil, dan setelah sinkronisasi offline berhasil — supaya
 * sisa hutang di cache TIDAK PERNAH basi.
 */
export async function refreshPelangganCache() {
  try {
    const customerRows = await fetchAllCustomers();
    const generalRes = await customersApi.list({ is_general: 'true', pageSize: 1 });
    const generalCustomers = generalRes?.data?.items?.[0] || null;
    const rows = generalCustomers ? [...customerRows, generalCustomers] : customerRows;
    await clearStore('customers').then(() => putAll('customers', rows));
    await setMeta(KEY_CUSTOMERS_SYNCED, new Date().toISOString());
    return { customers: rows.length };
  } catch (error) {
    return { error };
  }
}

/** Kapan terakhir cache pelanggan disinkronkan dari server (ISO) atau null. */
export async function getPelangganSyncedAt() {
  return getMeta(KEY_CUSTOMERS_SYNCED);
}

export function loadProductsOffline() {
  return getAll('products').then((rows) => rows || []);
}

export function loadCategoriesOffline() {
  return getAll('categories').then((rows) => rows || []);
}

export function loadCustomersOffline() {
  return getAll('customers').then((rows) => rows || []);
}

export async function loadGeneralCustomerOffline() {
  const rows = await loadCustomersOffline();
  return rows.find((c) => c?.is_general) || null;
}

export function searchProductsOffline(products, options) {
  return filterProductsLocal(products, options);
}

export function findProductOffline(products, code) {
  return findProductByCodeLocal(products, code);
}

export function searchCustomersOffline(customers, options) {
  return filterCustomersLocal(customers, options);
}