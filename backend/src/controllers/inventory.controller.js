import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage, fetchPage, countSignature, dateRange } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, badRequest, extractPgMessage, AppError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

const PRODUCT_STOCK_SELECT = 'id, sku, barcode, name, stock, min_stock, status, purchase_price, sale_price, category:categories(id, name), unit:product_units(id, name, short_name)';

// ============================================================
// STOK (daftar + filter)
// ============================================================
export const listInventory = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { category_id, filter } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('products').select(select, opts);
      if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`);
      if (category_id) query = query.eq('category_id', category_id);
      if (filter === 'low') query = query.lte('stock', 'min_stock');
      if (filter === 'out') query = query.lte('stock', 0);
      return query;
    },
    select: PRODUCT_STOCK_SELECT,
    signature: countSignature('inventory_products', [q, category_id, filter]),
    page,
    pageSize,
    orderBy: 'name',
    ascending: true,
  });

  const items = result.items.map((p) => ({
    ...p,
    is_low: Number(p.stock) <= Number(p.min_stock),
    is_out: Number(p.stock) <= 0,
  }));
  return ok(res, { ...result, items });
});

// ============================================================
// PERGERAKAN STOK
// ============================================================
export const listMovements = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const { product_id, type } = req.query;
  const q = safeSearch(req.query.search);
  const range = dateRange(req.query.from, req.query.to);

  // Cari product_id yang cocok dulu (dibatasi), lalu filter movement —
  // menghindari scan penuh tabel movements yang jauh lebih besar
  let matchedIds = null;
  if (q) {
    const { data: matched } = await supabase
      .from('products')
      .select('id')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
      .limit(100);
    const ids = (matched || []).map((p) => p.id);
    if (!ids.length) {
      return ok(res, buildPage([], 0, page, pageSize));
    }
    matchedIds = ids;
  }

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('inventory_movements').select(select, opts);
      if (product_id) query = query.eq('product_id', product_id);
      if (type) query = query.eq('type', type);
      if (range.gte) query = query.gte('created_at', range.gte);
      if (range.lte) query = query.lte('created_at', range.lte);
      if (matchedIds) query = query.in('product_id', matchedIds);
      return query;
    },
    select: '*, product:products(id, name, sku)',
    signature: countSignature('inventory_movements', [product_id, type, req.query.from, req.query.to, matchedIds]),
    page,
    pageSize,
    orderBy: 'created_at',
    ascending: false,
  });
  return ok(res, result);
});

// ============================================================
// PENYESUAIAN STOK
// ============================================================
export const adjustStock = asyncHandler(async (req, res) => {
  const { product_id, quantity, reason } = req.body;
  const { data, error } = await supabase.rpc('fn_adjust_stock', {
    p_product_id: product_id,
    p_quantity: quantity,
    p_reason: reason,
    p_created_by: req.user.id,
  });

  if (error) {
    throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  }
  return ok(res, data, 'Stok berhasil disesuaikan');
});

// ============================================================
// STOCK OPNAME
// ============================================================
export const listOpnames = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const { status } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('stock_opnames').select(select, opts);
      if (status) query = query.eq('status', status);
      return query;
    },
    select: '*, items:stock_opname_items(count), creator:users!stock_opnames_created_by_fkey(id, username, profiles(full_name))',
    signature: countSignature('stock_opnames', [status]),
    page,
    pageSize,
    orderBy: 'opname_date',
    ascending: false,
  });

  const items = result.items.map((o) => ({
    ...o,
    item_count: o.items?.[0]?.count || 0,
    items: undefined,
  }));
  return ok(res, { ...result, items });
});

export const getOpname = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('stock_opnames')
    .select('*, items:stock_opname_items(*, product:products(id, name, sku, unit:product_units(short_name)))')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Stock opname tidak ditemukan');
  return ok(res, data);
});

export const createOpname = asyncHandler(async (req, res) => {
  const { opname_date, notes, items } = req.body;

  const { data: opname, error } = await supabase
    .from('stock_opnames')
    .insert({ opname_date, notes, created_by: req.user.id, updated_by: req.user.id })
    .select('id')
    .single();
  if (error) throw error;

  const { error: itemErr } = await supabase.from('stock_opname_items').insert(
    items.map((i) => ({
      opname_id: opname.id,
      product_id: i.product_id,
      system_stock: i.system_stock,
      physical_stock: i.physical_stock,
      reason: i.reason || null,
    }))
  );
  if (itemErr) {
    await supabase.from('stock_opnames').delete().eq('id', opname.id);
    throw itemErr;
  }

  await writeAudit({
    user: req.user,
    action: 'STOCK_OPNAME_CREATED',
    module: 'stock_opname',
    recordId: opname.id,
    newData: { item_count: items.length },
    req,
  });
  return created(res, { id: opname.id }, 'Stock opname berhasil dibuat');
});

export const updateOpname = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { data: existing } = await supabase.from('stock_opnames').select('id, status').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Stock opname tidak ditemukan');
  if (existing.status !== 'draft') throw badRequest('Hanya stock opname draft yang dapat diubah', 'NOT_DRAFT');

  const { opname_date, notes, items } = req.body;
  await supabase.from('stock_opnames').update({ opname_date, notes, updated_by: req.user.id }).eq('id', id);

  await supabase.from('stock_opname_items').delete().eq('opname_id', id);
  const { error: itemErr } = await supabase.from('stock_opname_items').insert(
    items.map((i) => ({
      opname_id: id,
      product_id: i.product_id,
      system_stock: i.system_stock,
      physical_stock: i.physical_stock,
      reason: i.reason || null,
    }))
  );
  if (itemErr) throw itemErr;

  await writeAudit({ user: req.user, action: 'STOCK_OPNAME_UPDATED', module: 'stock_opname', recordId: id, newData: { item_count: items.length }, req });
  return ok(res, { id }, 'Stock opname berhasil diperbarui');
});

export const completeOpname = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('fn_complete_stock_opname', {
    p_opname_id: req.params.id,
    p_created_by: req.user.id,
  });
  if (error) {
    throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  }
  return ok(res, data, 'Stock opname selesai, stok sistem disesuaikan dengan stok fisik');
});

export const cancelOpname = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { data: existing } = await supabase.from('stock_opnames').select('id, status').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Stock opname tidak ditemukan');
  if (existing.status !== 'draft') throw badRequest('Hanya stock opname draft yang dapat dibatalkan', 'NOT_DRAFT');

  await supabase.from('stock_opnames').update({ status: 'cancelled', updated_by: req.user.id }).eq('id', id);
  await writeAudit({ user: req.user, action: 'STOCK_OPNAME_CANCELLED', module: 'stock_opname', recordId: id, req });
  return ok(res, null, 'Stock opname dibatalkan');
});

export const deleteOpname = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { data: existing } = await supabase.from('stock_opnames').select('id, status').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Stock opname tidak ditemukan');
  if (existing.status !== 'draft') throw badRequest('Hanya stock opname draft yang dapat dihapus', 'NOT_DRAFT');

  await supabase.from('stock_opnames').delete().eq('id', id);
  await writeAudit({ user: req.user, action: 'STOCK_OPNAME_DELETED', module: 'stock_opname', recordId: id, req });
  return ok(res, null, 'Stock opname berhasil dihapus');
});
