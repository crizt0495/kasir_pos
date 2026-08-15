import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { notifyNewSale } from '../services/notificationService.js';
import { getPagination, buildPage } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, AppError, extractPgMessage } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

const SALE_LIST_SELECT =
  'id, invoice_number, subtotal, discount, tax, additional_cost, total, payment_method, status, notes, created_at, ' +
  'customer:customers(id, name, phone), cashier:users!sales_cashier_id_fkey(id, username, profiles(full_name)), items:sale_items(count)';

const SALE_DETAIL_SELECT =
  '*, customer:customers(id, name, phone, email, address), ' +
  'cashier:users!sales_cashier_id_fkey(id, username, profiles(full_name)), ' +
  'items:sale_items(*, product:products(id, name, sku, unit:product_units(short_name))), ' +
  'payments:sale_payments(*)';

async function fetchSaleDetail(id) {
  const { data, error } = await supabase.from('sales').select(SALE_DETAIL_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

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
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { cashier_id, payment_method, status, customer_id } = req.query;

  let query = supabase.from('sales').select(SALE_LIST_SELECT, { count: 'exact' });
  if (q) query = query.ilike('invoice_number', `%${q}%`);
  if (cashier_id) query = query.eq('cashier_id', cashier_id);
  if (customer_id) query = query.eq('customer_id', customer_id);
  if (payment_method) query = query.eq('payment_method', payment_method);
  if (status) query = query.eq('status', status);
  if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
  if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);

  const sortable = { created_at: 'created_at', total: 'total', invoice_number: 'invoice_number' };
  const sortCol = sortable[req.query.sort] || 'created_at';
  const ascending = req.query.order === 'asc';

  const { data, count, error } = await query.order(sortCol, { ascending }).range(from, to);
  if (error) throw error;

  const items = (data || []).map((s) => ({
    ...s,
    item_count: s.items?.[0]?.count || 0,
    items: undefined,
  }));
  return ok(res, buildPage(items, count || 0, page, pageSize));
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await fetchSaleDetail(req.params.id);
  if (!sale) throw notFound('Transaksi tidak ditemukan');
  sale.returns = await fetchReturnsForSale(sale.id);
  return ok(res, sale);
});

export const createSale = asyncHandler(async (req, res) => {
  const body = req.body;

  const { data: result, error } = await supabase.rpc('fn_create_sale', {
    p_cashier_id: req.user.id,
    p_created_by: req.user.id,
    p_items: body.items,
    p_customer_id: body.customer_id || null,
    p_discount: body.discount || 0,
    p_tax: body.tax || 0,
    p_additional_cost: body.additional_cost || 0,
    p_payment_method: body.payment_method || 'CASH',
    p_cash_received: body.cash_received ?? null,
    p_notes: body.notes || null,
    p_session_id: body.session_id || null,
  });
  handleRpcError(error);

  const sale = await fetchSaleDetail(result.sale_id);

  // Notifikasi ke HP Owner — fire-and-forget, kegagalan TIDAK menggagalkan transaksi
  notifyNewSale(sale).catch(() => {});

  return created(res, { ...result, sale }, 'Transaksi berhasil');
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
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);

  let query = supabase
    .from('returns')
    .select(
      '*, sale: sales(invoice_number, payment_method), customer: customers(id, name), ' +
        'created_by_user: users(id, username, profiles(full_name)), items: return_items(count)',
      { count: 'exact' }
    );
  if (q) query = query.or(`return_number.ilike.%${q}%,sale.invoice_number.ilike.%${q}%`);
  if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
  if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);

  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const items = (data || []).map((r) => ({
    ...r,
    item_count: r.items?.[0]?.count || 0,
    items: undefined,
  }));
  return ok(res, buildPage(items, count || 0, page, pageSize));
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
