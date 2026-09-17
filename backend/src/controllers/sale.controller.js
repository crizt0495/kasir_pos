import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { fetchSaleDetail, createSaleRecord, editSaleRecord } from '../services/saleService.js';
import { cancelPiutang } from '../services/customerDebtService.js';
import { getPagination, buildPage, fetchPage, countSignature } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, AppError, extractPgMessage } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

const SALE_LIST_SELECT =
  'id, invoice_number, subtotal, discount, tax, additional_cost, total, payment_method, status, notes, created_at, ' +
  'customer:customers(id, name, phone), cashier:users!sales_cashier_id_fkey(id, username, profiles(full_name)), items:sale_items(count), ' +
  'debts:customer_debts(id, amount, paid_amount, remaining_amount, status, sale_id)';

async function fetchReturnsForSale(saleId) {
  const { data } = await supabase
    .from('returns')
    .select('*, items:return_items(*, product:products(id, name), sale_item_id)')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });
  return data || [];
}

function handleRpcError(error) {
  if (error) {
    throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  }
}

export const listSales = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { cashier_id, payment_method, status, customer_id } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('sales').select(select, opts);
      if (q) query = query.ilike('invoice_number', `%${q}%`);
      if (cashier_id) query = query.eq('cashier_id', cashier_id);
      if (customer_id) query = query.eq('customer_id', customer_id);
      if (payment_method) query = query.eq('payment_method', payment_method);
      if (status) query = query.eq('status', status);
      if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
      if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);
      return query;
    },
    select: SALE_LIST_SELECT,
    signature: countSignature('sales', [q, cashier_id, customer_id, payment_method, status, req.query.from, req.query.to]),
    page,
    pageSize,
    orderBy: ({ created_at: 'created_at', total: 'total', invoice_number: 'invoice_number' })[req.query.sort] || 'created_at',
    ascending: req.query.order === 'asc',
  });

  const items = result.items.map((s) => ({
    ...s,
    item_count: s.items?.[0]?.count || 0,
    items: undefined,
  }));
  return ok(res, { ...result, items });
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await fetchSaleDetail(req.params.id);
  if (!sale) throw notFound('Transaksi tidak ditemukan');
  sale.returns = await fetchReturnsForSale(sale.id);
  return ok(res, sale);
});

export const createSale = asyncHandler(async (req, res) => {
  const result = await createSaleRecord(req.user.id, req.body);
  return created(res, result, 'Transaksi berhasil');
});

/** Koreksi transaksi (Poin 5): stok, hutang, dan nilai transaksi diperbaiki. */
export const editSale = asyncHandler(async (req, res) => {
  const result = await editSaleRecord(req.user.id, req.params.id, req.body);
  return ok(res, result, 'Transaksi berhasil dikoreksi');
});

/** Batalkan piutang/hutang transaksi dari Detail Penjualan (single source). */
export const cancelSaleDebt = asyncHandler(async (req, res) => {
  const result = await cancelPiutang({
    saleId: req.params.id,
    reason: req.body.reason,
    user: req.user,
  });
  const sale = await fetchSaleDetail(req.params.id);
  return ok(res, { ...result, sale }, 'Hutang transaksi berhasil dibatalkan');
});

/**
 * Sinkronkan antrian transaksi offline (POST /api/sync-offline-transactions).
 * Dikirim frontend SATU PER SATU saat internet kembali. Antrian berhenti pada
 * transaksi pertama yang gagal — transaksi gagal tetap disimpan di device dan
 * dicoba lagi nanti (retry 30 detik).
 */
export const syncOfflineTransactions = asyncHandler(async (req, res) => {
  const transactions = req.body.transactions;
  const results = [];
  let stopped = false;

  for (const { offline_id, payload } of transactions) {
    if (stopped) {
      results.push({ offline_id, success: false, error: 'Antrian dihentikan sementara (transaksi sebelumnya gagal)' });
      continue;
    }
    try {
      const created = await createSaleRecord(req.user.id, payload, { offlineId: offline_id });
      results.push({ offline_id, success: true, ...created });
    } catch (err) {
      // Transaksi gagal TETAP disimpan di device oleh frontend, dicoba lagi
      // setelah delay (30 detik). Hentikan antrian supaya tidak mengirim
      // transaksi berikutnya berdasarkan data yang mungkin sudah usang.
      stopped = true;
      results.push({ offline_id, success: false, error: String(err?.message || err).slice(0, 500) });
    }
  }

  return ok(
    res,
    {
      total: results.length,
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    },
    'Sinkronisasi transaksi offline selesai'
  );
});

export const refundSale = asyncHandler(async (req, res) => {
  const { items, reason, session_id } = req.body;

  const { data: result, error } = await supabase.rpc('fn_refund_sale', {
    p_sale_id: req.params.id,
    p_created_by: req.user.id,
    p_items: items,
    p_reason: reason,
    p_session_id: session_id || null,
  });
  handleRpcError(error);

  return ok(res, result, 'Retur berhasil diproses');
});

// ============================================================
// RETURNS (riwayat)
// ============================================================
export const listReturns = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('returns').select(select, opts);
      if (q) query = query.or(`return_number.ilike.%${q}%,sale.invoice_number.ilike.%${q}%`);
      if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
      if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);
      return query;
    },
    select:
      '*, sale: sales(invoice_number, payment_method), customer: customers(id, name), ' +
      'created_by_user: users(id, username, profiles(full_name)), items: return_items(count)',
    signature: countSignature('returns', [q, req.query.from, req.query.to]),
    page,
    pageSize,
    orderBy: 'created_at',
  });

  const items = result.items.map((r) => ({
    ...r,
    item_count: r.items?.[0]?.count || 0,
    items: undefined,
  }));
  return ok(res, { ...result, items });
});

export const getReturn = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('returns')
    .select('*, sale: sales(*), customer: customers(*), created_by_user: users(id, username, profiles(full_name)), items: return_items(*, product: products(id, name, sku))')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Retur tidak ditemukan');
  return ok(res, data);
});

export { writeAudit };
