import { supabase } from '../config/supabase.js';

// ============================================================
// SISA HUTANG — single source of truth.
// Dihitung LIVE dari tabel customer_debts (bukan field statis
// customers.pending_debt yang bisa basi). Dipakai oleh endpoint
// /api/customers (list & detail) dan pemilih pelanggan di POS.
// ============================================================

/** Sisa hutang utk satu pelanggan: SUM(remaining_amount) yang belum lunas. */
export async function getSisaHutang(customerId) {
  const map = await getSisaHutangMap([customerId]);
  return map[customerId]?.sisa ?? 0;
}

/** Map customer_id → { sisa, total } utk banyak id (pakai 1 query, hindari N+1). */
export async function getSisaHutangMap(customerIds) {
  const ids = (customerIds || []).filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('customer_debts')
    .select('customer_id, amount, remaining_amount, status')
    .in('customer_id', ids)
    .neq('status', 'cancelled');
  if (error) {
    throw new Error(`Failed to get sisa hutang: ${error.message}`);
  }
  const map = {};
  for (const row of data || []) {
    const cur = map[row.customer_id] || { sisa: 0, total: 0 };
    cur.total += Number(row.amount || 0);
    if (['pending', 'partial', 'overdue'].includes(row.status)) {
      cur.sisa += Number(row.remaining_amount || 0);
    }
    map[row.customer_id] = cur;
  }
  return map;
}

export async function getCustomerDebtStats(customerId) {
  const { data, error } = await supabase.rpc('fn_get_customer_debt_stats', {
    p_customer_id: customerId,
  });

  if (error) {
    throw new Error(`Failed to get debt stats: ${error.message}`);
  }

  return data;
}

export async function getDebtHistory(customerId, options = {}) {
  const { page = 1, pageSize = 20, status = null } = options;

  const { from, to } = {
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
  };

  let query = supabase.from('customer_debts').select('*', { count: 'exact' });
  query = query.eq('customer_id', customerId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get debt history: ${error.message}`);
  }

  return {
    items: data || [],
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

export async function payDebt(debtId, amount, userId) {
  const { data, error } = await supabase.rpc('fn_pay_debt', {
    p_debt_id: debtId,
    p_amount: amount,
    p_created_by: userId,
  });

  if (error) {
    throw new Error(`Failed to pay debt: ${error.message}`);
  }

  return data;
}

export async function recordDebt(customerId, amount, dueDate, notes, userId) {
  const { data, error } = await supabase.rpc('fn_record_debt', {
    p_customer_id: customerId,
    p_amount: amount,
    p_due_date: dueDate,
    p_notes: notes || null,
    p_created_by: userId,
  });

  if (error) {
    throw new Error(`Failed to record debt: ${error.message}`);
  }

  return data;
}