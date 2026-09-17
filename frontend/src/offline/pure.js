//
// Helpers MURNI untuk mode offline — tidak menyentuh IndexedDB/API sehingga
// mudah diuji (node env tanpa browser). Baca data dari argumen.
//

/** Apakah error berasal dari kegagalan jaringan (bukan respons server)? */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.response) return false; // server merespons → bukan masalah jaringan
  if (error.isAxiosError) return true;
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ERR_NETWORK' ||
    error.message === 'Network Error'
  );
}

const normalize = (s) => String(s || '').trim().toLowerCase();

/**
 * Filter katalog produk lokal persis meniru perilaku endpoint server:
 * - search: cocok di nama, SKU, atau barcode (case-insensitive) — server `ilike`
 * - category_id: kecocokan persis
 * - urut berdasarkan nama (asc) → potong `limit`
 * Produk nonaktif tetap disertakan (server tidak memfilter status bila tidak dikirim).
 */
export function filterProductsLocal(products, { search, categoryId, limit = 100 } = {}) {
  const q = normalize(search);
  const items = (products || [])
    .filter((p) => {
      if (!p) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        normalize(p.name).includes(q) ||
        normalize(p.sku).includes(q) ||
        normalize(p.barcode).includes(q)
      );
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  return items.slice(0, limit);
}

/** Cari produk by kode (barcode presisi → SKU) di katalog lokal. */
export function findProductByCodeLocal(products, code) {
  const c = normalize(code);
  if (!c || !Array.isArray(products)) return null;
  return (
    products.find((p) => p && normalize(p.barcode) === c) ||
    products.find((p) => p && normalize(p.sku) === c) ||
    null
  );
}

/** Filter pelanggan lokal: cocok nama / nomor HP, urut nama, potong limit. */
export function filterCustomersLocal(customers, { search, limit = 10 } = {}) {
  const q = normalize(search);
  const items = (customers || [])
    .filter((c) => {
      if (!c) return false;
      if (!q) return true;
      return normalize(c.name).includes(q) || normalize(c.phone).includes(q);
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  return items.slice(0, limit);
}

/** Sisa hutang pelanggan: preferensi field live `sisa_hutang`, fallback `pending_debt`. */
export function getSisaHutangOf(customer) {
  const value = Number(customer?.sisa_hutang ?? customer?.pending_debt ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/** Label umur cache pelanggan utk tampilan "Data: Offline (update X menit lalu)". */
export function cacheAgeMinutes(syncedAtIso, now = Date.now()) {
  if (!syncedAtIso) return null;
  const synced = new Date(syncedAtIso).getTime();
  if (Number.isNaN(synced)) return null;
  return Math.max(1, Math.floor((now - synced) / 60000));
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Nomor struk sementara utk transaksi offline (diganti nomor asli saat sync). */
export function buildOfflineInvoiceNumber(now = new Date(), prefix = 'INV') {
  const d = now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());
  const t = pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds());
  return `${prefix}-OFF-${d}-${t}`;
}

/**
 * Bangun objek "sale" sementara (kompatibel dengan Receipt/escpos) +
 * payload ulang (replay) untuk transaksi yang disimpan offline.
 *
 * - cart: { items, discount, customer } (iringan useCartStore)
 * - payload: payload LENGKAP yang dikirim ke salesApi.create
 * - totals: hasil computeTotals (subtotal, discount, tax, additional_cost, total)
 * - user: user dari authStore (untuk nama kasir di struk)
 * - offlineId: id unik transaksi (UUID)
 */
export function buildPendingSale({ cart, payload, totals, user, offlineId }) {
  const now = new Date();
  const items = (cart?.items || []).map((it) => {
    const subtotal = Number(it.product.sale_price) * Number(it.quantity) - Number(it.discount || 0);
    return {
      product: {
        id: it.product.id,
        name: it.product.name,
        sku: it.product.sku,
        unit: it.product.unit || null,
      },
      quantity: Number(it.quantity),
      price: Number(it.product.sale_price),
      discount: Number(it.discount || 0),
      subtotal,
    };
  });

  const fullName = user?.profile?.full_name || user?.username || null;
  const cashier = {
    username: user?.username || null,
    profiles: { full_name: fullName },
  };
  const paymentMethod = payload?.payment_method || 'CASH';
  const cashReceived =
    payload?.cash_received != null ? Number(payload.cash_received) : Number(totals.total);
  const changeAmount = Math.max(0, cashReceived - Number(totals.total));

  const sale = {
    id: offlineId,
    offline_id: offlineId,
    invoice_number: buildOfflineInvoiceNumber(now, 'INV'),
    created_at: now.toISOString(),
    cashier,
    customer: cart?.customer || null,
    items,
    discount: Number(cart?.discount || 0),
    tax: Number(totals.tax || 0),
    additional_cost: Number(totals.additional_cost || 0),
    total: Number(totals.total),
    payment_method: paymentMethod,
    status: 'completed',
    is_offline: true,
    payments: [{ cash_received: cashReceived, change_amount: changeAmount }],
  };

  return {
    offline_id: offlineId,
    created_at: sale.created_at,
    is_pending: true,
    payload,
    sale,
  };
}