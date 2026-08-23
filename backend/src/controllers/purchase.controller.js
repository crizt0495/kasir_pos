import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage, fetchPage, countSignature } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, badRequest, AppError, extractPgMessage } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

const LIST_SELECT =
  'id, purchase_number, invoice_number, purchase_date, subtotal, discount, total, payment_status, status, notes, created_at, ' +
  'supplier:suppliers(id, name), items:purchase_items(count)';

async function fetchPurchaseDetail(id) {
  const { data, error } = await supabase
    .from('purchases')
    .select('*, supplier:suppliers(*), items:purchase_items(*, product:products(id, name, sku, unit:product_units(short_name)))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const listPurchases = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { supplier_id, status, payment_status } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('purchases').select(select, opts);
      if (q) query = query.or(`purchase_number.ilike.%${q}%,invoice_number.ilike.%${q}%`);
      if (supplier_id) query = query.eq('supplier_id', supplier_id);
      if (status) query = query.eq('status', status);
      if (payment_status) query = query.eq('payment_status', payment_status);
      if (req.query.from) query = query.gte('purchase_date', req.query.from);
      if (req.query.to) query = query.lte('purchase_date', req.query.to);
      return query;
    },
    select: LIST_SELECT,
    signature: countSignature('purchases', [q, supplier_id, status, payment_status, req.query.from, req.query.to]),
    page,
    pageSize,
    orderBy: 'purchase_date',
    ascending: false,
  });

  const items = result.items.map((p) => ({
    ...p,
    item_count: p.items?.[0]?.count || 0,
    items: undefined,
  }));
  return ok(res, { ...result, items });
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await fetchPurchaseDetail(req.params.id);
  if (!purchase) throw notFound('Pembelian tidak ditemukan');
  return ok(res, purchase);
});

export const createPurchase = asyncHandler(async (req, res) => {
  const body = req.body;
  const { data: result, error } = await supabase.rpc('fn_create_purchase', {
    p_supplier_id: body.supplier_id || null,
    p_created_by: req.user.id,
    p_items: body.items,
    p_invoice_number: body.invoice_number || null,
    p_purchase_date: body.purchase_date || new Date().toISOString().slice(0, 10),
    p_discount: body.discount || 0,
    p_notes: body.notes || null,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });

  const purchase = await fetchPurchaseDetail(result.purchase_id);
  return created(res, { ...result, purchase }, 'Pembelian berhasil dibuat');
});

export const updatePurchase = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { data: existing } = await supabase.from('purchases').select('id, status, purchase_number').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Pembelian tidak ditemukan');
  if (existing.status !== 'draft') throw badRequest('Hanya pembelian draft yang dapat diubah', 'NOT_DRAFT');

  const { supplier_id, invoice_number, purchase_date, discount, notes, items } = req.body;

  // Hitung ulang subtotal & total di server (tidak percaya angka dari client)
  let subtotal = 0;
  for (const it of items) subtotal += Number(it.quantity) * Number(it.cost_price);
  const total = subtotal - Number(discount || 0);

  const { data: purchase, error: upErr } = await supabase
    .from('purchases')
    .update({
      supplier_id: supplier_id || null,
      invoice_number: invoice_number || null,
      purchase_date,
      discount: discount || 0,
      subtotal,
      total,
      notes: notes || null,
      updated_by: req.user.id,
    })
    .eq('id', id)
    .select('id')
    .single();
  if (upErr) throw upErr;

  await supabase.from('purchase_items').delete().eq('purchase_id', id);
  const { error: itemErr } = await supabase.from('purchase_items').insert(
    items.map((i) => ({
      purchase_id: id,
      product_id: i.product_id,
      quantity: i.quantity,
      cost_price: i.cost_price,
      subtotal: Number(i.quantity) * Number(i.cost_price),
    }))
  );
  if (itemErr) throw itemErr;

  await writeAudit({
    user: req.user,
    action: 'PURCHASE_UPDATED',
    module: 'purchases',
    recordId: id,
    newData: { purchase_number: existing.purchase_number, total },
    req,
  });
  return ok(res, await fetchPurchaseDetail(id), 'Pembelian berhasil diperbarui');
});

export const deletePurchase = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { data: existing } = await supabase.from('purchases').select('id, status, purchase_number').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Pembelian tidak ditemukan');
  if (existing.status !== 'draft') throw badRequest('Hanya pembelian draft yang dapat dihapus', 'NOT_DRAFT');

  const { error } = await supabase.from('purchases').delete().eq('id', id);
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'PURCHASE_DELETED',
    module: 'purchases',
    recordId: id,
    newData: { purchase_number: existing.purchase_number },
    req,
  });
  return ok(res, null, 'Pembelian berhasil dihapus');
});

export const receivePurchase = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('fn_receive_purchase', {
    p_purchase_id: req.params.id,
    p_created_by: req.user.id,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  return ok(res, data, 'Pembelian diterima, stok bertambah');
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { payment_status } = req.body;

  const { data: existing } = await supabase.from('purchases').select('id, status, purchase_number, payment_status').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Pembelian tidak ditemukan');
  if (existing.status === 'cancelled') throw badRequest('Pembelian dibatalkan', 'CANCELLED');

  const { data, error } = await supabase
    .from('purchases')
    .update({ payment_status, updated_by: req.user.id })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'PURCHASE_PAYMENT_UPDATED',
    module: 'purchases',
    recordId: id,
    oldData: { payment_status: existing.payment_status },
    newData: { payment_status },
    req,
  });
  return ok(res, data, 'Status pembayaran diperbarui');
});
