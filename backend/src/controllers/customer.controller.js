import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage, fetchPage, countSignature } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, AppError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

// ============================================================
// CUSTOMERS
// ============================================================

const CUSTOMER_SELECT = '*, sales: sales(status, total)';
// Daftar: kolom minimal — agregat transaksi dihitung via fn_customers_stats
// (jangan embed seluruh riwayat sales per pelanggan di daftar)
const CUSTOMER_LIST_SELECT = 'id, name, phone, email, is_general, created_at, total_debt, pending_debt';

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const q = safeSearch(req.query.search);

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('customers').select(select, opts);
      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
      if (req.query.is_general === 'true') query = query.eq('is_general', true);
      else if (req.query.is_general === 'false') query = query.eq('is_general', false);
      return query;
    },
    select: CUSTOMER_LIST_SELECT,
    signature: countSignature('customers', [q, req.query.is_general]),
    page,
    pageSize,
    orderBy: 'created_at',
  });

  const ids = result.items.map((c) => c.id);
  let statsMap = {};
  if (ids.length) {
    const { data: stats } = await supabase.rpc('fn_customers_stats', { p_ids: ids });
    for (const row of Array.isArray(stats) ? stats : []) {
      statsMap[row.customer_id] = { total_transactions: Number(row.total_transactions || 0), total_spend: Number(row.total_spend || 0) };
    }
  }

  const items = result.items.map((c) => ({
    ...c,
    total_transactions: statsMap[c.id]?.total_transactions ?? 0,
    total_spend: statsMap[c.id]?.total_spend ?? 0,
  }));

  return ok(res, { ...result, items });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('customers').select(CUSTOMER_SELECT).eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Pelanggan tidak ditemukan');

  const validSales = (data.sales || []).filter((s) => s.status !== 'cancelled');

  let debtStats = null;
  try {
    const { data: stats } = await supabase.rpc('fn_get_customer_debt_stats', { p_customer_id: req.params.id });
    debtStats = stats;
  } catch (err) {
    // ignore kalau kolom/RPC belum ada di DB
  }

  return ok(res, {
    ...data,
    sales: undefined,
    total_transactions: validSales.length,
    total_spend: validSales.reduce((sum, s) => sum + Number(s.total || 0), 0),
    debt_stats: debtStats,
  });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const { data: customer, error } = await supabase
    .from('customers')
    .insert({ ...req.body, created_by: req.user.id, updated_by: req.user.id })
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'CUSTOMER_CREATED', module: 'customers', recordId: customer.id, newData: { name: customer.name }, req });
  return created(res, customer, 'Pelanggan berhasil dibuat');
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('customers').select('id, name, is_general').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Pelanggan tidak ditemukan');
  if (existing.is_general && req.body.is_general === false) {
    throw new AppError('Pelanggan Umum tidak dapat diubah menjadi pelanggan biasa', { code: 'BAD_REQUEST', status: 400 });
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .update({ ...req.body, updated_by: req.user.id })
    .eq('id', req.params.id)
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'CUSTOMER_UPDATED',
    module: 'customers',
    recordId: customer.id,
    oldData: { name: existing.name },
    newData: { name: customer.name },
    req,
  });
  return ok(res, customer, 'Pelanggan berhasil diperbarui');
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('customers').select('id, name, is_general').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Pelanggan tidak ditemukan');
  if (existing.is_general) {
    throw new AppError('Pelanggan Umum tidak dapat dihapus', { code: 'BAD_REQUEST', status: 400 });
  }
  const { error } = await supabase.from('customers').delete().eq('id', req.params.id);
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'CUSTOMER_DELETED', module: 'customers', recordId: req.params.id, newData: { name: existing.name }, req });
  return ok(res, null, 'Pelanggan berhasil dihapus');
});

// ============================================================
// SUPPLIERS
// ============================================================

export const listSuppliers = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const q = safeSearch(req.query.search);
  const { status } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('suppliers').select(select, opts);
      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,contact_person.ilike.%${q}%`);
      if (status) query = query.eq('status', status);
      return query;
    },
    select: 'id, name, contact_person, phone, email, address, notes, status, created_at',
    signature: countSignature('suppliers', [q, status]),
    page,
    pageSize,
    orderBy: 'created_at',
  });
  return ok(res, result);
});

export const getSupplier = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Supplier tidak ditemukan');
  return ok(res, data);
});

export const createSupplier = asyncHandler(async (req, res) => {
  const { data: supplier, error } = await supabase
    .from('suppliers')
    .insert({ ...req.body, created_by: req.user.id, updated_by: req.user.id })
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'SUPPLIER_CREATED', module: 'suppliers', recordId: supplier.id, newData: { name: supplier.name }, req });
  return created(res, supplier, 'Supplier berhasil dibuat');
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('suppliers').select('id, name').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Supplier tidak ditemukan');

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .update({ ...req.body, updated_by: req.user.id })
    .eq('id', req.params.id)
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'SUPPLIER_UPDATED',
    module: 'suppliers',
    recordId: supplier.id,
    oldData: { name: existing.name },
    newData: { name: supplier.name },
    req,
  });
  return ok(res, supplier, 'Supplier berhasil diperbarui');
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('suppliers').select('id, name').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Supplier tidak ditemukan');
  const { error } = await supabase.from('suppliers').delete().eq('id', req.params.id);
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'SUPPLIER_DELETED', module: 'suppliers', recordId: req.params.id, newData: { name: existing.name }, req });
  return ok(res, null, 'Supplier berhasil dihapus');
});
