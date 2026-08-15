import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, conflict, badRequest, AppError, extractPgMessage } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ============================================================
// CASH SESSIONS
// ============================================================
export const listSessions = asyncHandler(async (req, res) => {
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const { status } = req.query;

  let query = supabase
    .from('cash_sessions')
    .select('*, opened_by_user: users(id, username, profiles(full_name))', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (req.query.from) query = query.gte('opened_at', `${req.query.from}T00:00:00.000Z`);
  if (req.query.to) query = query.lte('opened_at', `${req.query.to}T23:59:59.999Z`);

  const { data, count, error } = await query.order('opened_at', { ascending: false }).range(from, to);
  if (error) throw error;
  return ok(res, buildPage(data || [], count || 0, page, pageSize));
});

export const getOpenSession = asyncHandler(async (req, res) => {
  const { data } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('opened_by', req.user.id)
    .eq('status', 'open')
    .maybeSingle();
  return ok(res, data || null);
});

export const openSession = asyncHandler(async (req, res) => {
  const { opening_balance } = req.body;

  const { data: existing } = await supabase
    .from('cash_sessions')
    .select('id')
    .eq('opened_by', req.user.id)
    .eq('status', 'open')
    .maybeSingle();
  if (existing) throw conflict('Anda masih memiliki sesi kas yang terbuka', 'SESSION_ALREADY_OPEN');

  const { data: session, error } = await supabase
    .from('cash_sessions')
    .insert({ opened_by: req.user.id, opening_balance: opening_balance || 0, status: 'open' })
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'CASH_SESSION_OPENED',
    module: 'cashier',
    recordId: session.id,
    newData: { opening_balance },
    req,
  });
  return created(res, session, 'Sesi kas dibuka');
});

export const closeSession = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { actual_cash, note } = req.body;

  const { data: session, error: sErr } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw notFound('Sesi kas tidak ditemukan');
  if (session.status === 'closed') throw conflict('Sesi kas sudah ditutup', 'SESSION_CLOSED');

  const { data: txSum } = await supabase.from('cash_transactions').select('sum:amount.sum()').eq('session_id', id);
  const txTotal = Number(txSum?.[0]?.sum || 0);

  const expected = Number(session.opening_balance) + txTotal;
  const difference = Math.round((Number(actual_cash) - expected) * 100) / 100;

  if (difference !== 0 && !note?.trim()) {
    throw badRequest('Terdapat selisih kas, catatan wajib diisi', 'DIFFERENCE_NOTE_REQUIRED');
  }

  const { data: updated, error } = await supabase
    .from('cash_sessions')
    .update({
      closed_at: new Date().toISOString(),
      expected_cash: expected,
      actual_cash,
      difference,
      close_note: note || null,
      status: 'closed',
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'CASH_SESSION_CLOSED',
    module: 'cashier',
    recordId: id,
    oldData: { opening_balance: session.opening_balance },
    newData: { expected, actual_cash, difference },
    req,
  });
  return ok(res, updated, 'Sesi kas ditutup');
});

// ============================================================
// CASH TRANSACTIONS
// ============================================================
export const listTransactions = asyncHandler(async (req, res) => {
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const { session_id, type } = req.query;

  let query = supabase
    .from('cash_transactions')
    .select('*, created_by_user: users(id, username, profiles(full_name))', { count: 'exact' });
  if (session_id) query = query.eq('session_id', session_id);
  if (type) query = query.eq('type', type);
  if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
  if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);

  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;
  return ok(res, buildPage(data || [], count || 0, page, pageSize));
});

export const addTransaction = asyncHandler(async (req, res) => {
  const { session_id, type, amount, notes } = req.body;

  const { data: session } = await supabase.from('cash_sessions').select('id, status').eq('id', session_id).maybeSingle();
  if (!session) throw notFound('Sesi kas tidak ditemukan');
  if (session.status === 'closed') throw conflict('Sesi kas sudah ditutup', 'SESSION_CLOSED');

  const signedAmount = type === 'OUT' ? -amount : amount;
  const { data: tx, error } = await supabase
    .from('cash_transactions')
    .insert({ session_id, type, amount: signedAmount, notes: notes || null, created_by: req.user.id })
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'CASH_TRANSACTION_CREATED',
    module: 'cashier',
    recordId: tx.id,
    newData: { session_id, type, amount: signedAmount },
    req,
  });
  return created(res, tx, 'Transaksi kas ditambahkan');
});

// ============================================================
// EXPENSES
// ============================================================
export const listExpenses = asyncHandler(async (req, res) => {
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const { category } = req.query;

  let query = supabase
    .from('expenses')
    .select('*, created_by_user: users!expenses_created_by_fkey(id, username, profiles(full_name))', { count: 'exact' });
  if (category) query = query.eq('category', category);
  if (req.query.from) query = query.gte('expense_date', req.query.from);
  if (req.query.to) query = query.lte('expense_date', req.query.to);

  const { data, count, error } = await query.order('expense_date', { ascending: false }).range(from, to);
  if (error) throw error;
  return ok(res, buildPage(data || [], count || 0, page, pageSize));
});

export const createExpense = asyncHandler(async (req, res) => {
  const body = req.body;
  const { data: result, error } = await supabase.rpc('fn_create_expense', {
    p_category: body.category,
    p_amount: body.amount,
    p_created_by: req.user.id,
    p_description: body.description || null,
    p_payment_method: body.payment_method || 'CASH',
    p_expense_date: body.expense_date || new Date().toISOString().slice(0, 10),
    p_session_id: body.session_id || null,
  });
  if (error) throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  return created(res, result, 'Pengeluaran berhasil dicatat');
});

export const updateExpense = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('expenses').select('id, amount').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Pengeluaran tidak ditemukan');

  const { data: expense, error } = await supabase
    .from('expenses')
    .update({ ...req.body, updated_by: req.user.id })
    .eq('id', req.params.id)
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'EXPENSE_UPDATED',
    module: 'expenses',
    recordId: expense.id,
    oldData: { amount: existing.amount },
    newData: { amount: expense.amount },
    req,
  });
  return ok(res, expense, 'Pengeluaran berhasil diperbarui');
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { data: existing } = await supabase.from('expenses').select('id, amount').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Pengeluaran tidak ditemukan');

  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;

  // Hapus transaksi kas terkait (jika dicatat saat pembuatan)
  await supabase.from('cash_transactions').delete().eq('reference_type', 'expense').eq('reference_id', id);

  await writeAudit({
    user: req.user,
    action: 'EXPENSE_DELETED',
    module: 'expenses',
    recordId: id,
    newData: { amount: existing.amount },
    req,
  });
  return ok(res, null, 'Pengeluaran berhasil dihapus');
});
