import { supabase } from '../config/supabase.js';

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