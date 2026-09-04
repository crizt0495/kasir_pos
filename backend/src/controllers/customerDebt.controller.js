import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage, fetchPage, countSignature } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, badRequest, AppError, extractPgMessage } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

export const listDebts = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { status, customer_id } = req.query;

  const baseFilters = { customer_id, q };

  const [listResult, stats] = await Promise.all([
    fetchPage({
      buildQuery: (select, opts) => {
        let query = supabase.from('customer_debts').select(select, opts);
        if (customer_id) query = query.eq('customer_id', customer_id);
        if (status) query = query.eq('status', status);
        if (q) query = query.or(`notes.ilike.%${q}%`);
        return query;
      },
      select:
        'id, amount, paid_amount, remaining_amount, due_date, status, notes, created_at, customer:customers(id, name, phone), created_by_user:users!customer_debts_created_by_fkey(id, username, profiles(full_name))',
      signature: countSignature('customer_debts', [status, customer_id, q]),
      page,
      pageSize,
      orderBy: 'created_at',
      ascending: false,
    }),
    getGlobalDebtStats(baseFilters),
  ]);

  return ok(res, { ...listResult, stats });
});

async function getGlobalDebtStats({ customer_id, q }) {
  let query = supabase
    .from('customer_debts')
    .select('amount, paid_amount, remaining_amount, status, due_date')
    .neq('status', 'cancelled');
  
  if (customer_id) query = query.eq('customer_id', customer_id);
  if (q) query = query.or(`notes.ilike.%${q}%`);

  const { data: debts, error } = await query;
  if (error) throw error;

  const rows = debts || [];
  return {
    total_debt: rows.reduce((a, d) => a + Number(d.amount || 0), 0),
    total_paid: rows.reduce((a, d) => a + Number(d.paid_amount || 0), 0),
    pending_debt: rows.reduce((a, d) => a + Math.max(0, Number(d.remaining_amount || 0)), 0),
    pending_count: rows.filter((d) => d.status === 'pending' || d.status === 'partial').length,
    overdue_count: rows.filter((d) => d.status === 'overdue').length,
    total_count: rows.length,
  };
}

export const listDebtsByCustomer = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const customerId = req.params.customer_id;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      return supabase.from('customer_debts').select(select, opts).eq('customer_id', customerId);
    },
    select:
      'id, amount, paid_amount, remaining_amount, due_date, status, notes, created_at, customer:customers(id, name, phone), created_by_user:users!customer_debts_created_by_fkey(id, username, profiles(full_name))',
    signature: countSignature('customer_debts', [customerId]),
    page,
    pageSize,
    orderBy: 'created_at',
    ascending: false,
  });

  return ok(res, result);
});

export const getDebt = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('customer_debts')
    .select('*, customer:customers(*), created_by_user:users!customer_debts_created_by_fkey(id, username, profiles(full_name)), updated_by_user:users!customer_debts_updated_by_fkey(id, username, profiles(full_name))')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Hutang tidak ditemukan');
  return ok(res, data);
});

export const createDebt = asyncHandler(async (req, res) => {
  const body = req.body;

  const { data: result, error } = await supabase.rpc('fn_record_debt', {
    p_customer_id: body.customer_id,
    p_amount: body.amount,
    p_due_date: body.due_date,
    p_notes: body.notes || null,
    p_created_by: req.user.id,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });

  const debt = await getDebtFromId(result.debt_id);

  await writeAudit({
    user: req.user,
    action: 'DEBT_CREATED',
    module: 'customer_debts',
    recordId: result.debt_id,
    newData: body,
    req,
  });

  return created(res, { ...result, debt }, 'Hutang berhasil dicatat');
});

export const payDebt = asyncHandler(async (req, res) => {
  const body = req.body;

  // Selalu gunakan overload 5-arg (payment_method + notes).
  // Parameter default di DB: p_payment_method='CASH', p_notes=null.
  const payload = {
    p_debt_id: req.params.id,
    p_amount: body.amount,
    p_created_by: req.user.id,
    p_payment_method: body.payment_method || 'CASH',
    p_notes: body.notes || null,
  };

  const { data: result, error } = await supabase.rpc('fn_pay_debt', payload);
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });

  const debt = await getDebtFromId(req.params.id);

  await writeAudit({
    user: req.user,
    action: 'DEBT_PAID',
    module: 'customer_debts',
    recordId: req.params.id,
    newData: { amount_paid: result.amount_paid, debt_status: result.status, payment_method: body.payment_method || 'CASH' },
    req,
  });

  return ok(res, { ...result, debt }, 'Pembayaran hutang berhasil');
});

// Riwayat pembayaran hutang (spec §9) — via debt_payments
export const getDebtPaymentHistory = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('fn_get_debt_payment_history', {
    p_debt_id: req.params.id,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });

  return ok(res, data);
});

// Pembatalan/void hutang dengan alasan (spec §20) — hutang tidak dihapus
export const cancelDebt = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim() === '') {
    throw badRequest('Alasan pembatalan wajib diisi');
  }

  const { data: result, error } = await supabase.rpc('fn_cancel_debt', {
    p_debt_id: req.params.id,
    p_reason: reason,
    p_created_by: req.user.id,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });

  const debt = await getDebtFromId(req.params.id);

  await writeAudit({
    user: req.user,
    action: 'DEBT_CANCELLED',
    module: 'customer_debts',
    recordId: req.params.id,
    oldData: { status: req.body.oldStatus },
    newData: { status: 'cancelled', reason },
    req,
  });

  return ok(res, { ...result, debt }, 'Hutang berhasil dibatalkan');
});

export const getDebtStats = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('fn_get_customer_debt_stats', {
    p_customer_id: req.params.customer_id,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });

  return ok(res, data);
});

async function getDebtFromId(id) {
  const { data, error } = await supabase
    .from('customer_debts')
    .select('*, customer:customers(*), created_by_user:users!customer_debts_created_by_fkey(id, username, profiles(full_name)), updated_by_user:users!customer_debts_updated_by_fkey(id, username, profiles(full_name))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}