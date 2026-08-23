import { supabase } from '../config/supabase.js';
import { getPagination, buildPage, fetchPage, countSignature } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, AppError, extractPgMessage } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ============================================================
// BAGI HASIL 2,5% TAHUNAN
// ============================================================

const SHARE_SELECT =
  'id, period_id, customer_id, total_purchase, total_profit, share_amount, status, updated_at, ' +
  'customer:customers(id, name, phone)';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export const listPeriods = asyncHandler(async (req, res) => {
  const { data: periods, error } = await supabase
    .from('profit_periods')
    .select('id, year, start_date, end_date, status, created_at')
    .order('year', { ascending: false });
  if (error) throw error;

  // Ringkasan per periode
  const periodsWithTotals = await Promise.all(
    (periods || []).map(async (p) => {
      const { data: shares } = await supabase
        .from('customer_profit_shares')
        .select('share_amount, status')
        .eq('period_id', p.id);
      const { data: distributions } = await supabase
        .from('profit_distributions')
        .select('amount')
        .eq('period_id', p.id);
      const totalShare = (shares || []).reduce((a, s) => a + Number(s.share_amount || 0), 0);
      const distributed = (distributions || []).reduce((a, d) => a + Number(d.amount || 0), 0);
      return {
        ...p,
        totals: {
          customers: (shares || []).length,
          paid_customers: (shares || []).filter((s) => s.status === 'paid').length,
          share: Math.round(totalShare * 100) / 100,
          distributed: Math.round(distributed * 100) / 100,
          remaining: Math.round((totalShare - distributed) * 100) / 100,
        },
      };
    })
  );

  return ok(res, periodsWithTotals);
});

export const createPeriod = asyncHandler(async (req, res) => {
  const year = Number(req.body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError('Tahun tidak valid', { code: 'VALIDATION_ERROR', status: 400 });
  }
  const { data: period, error } = await supabase
    .from('profit_periods')
    .insert({
      year,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      status: 'open',
      created_by: req.user.id,
    })
    .select('id, year, start_date, end_date, status')
    .single();
  if (error) {
    throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  }
  return created(res, period, 'Periode bagi hasil dibuat');
});

export const updatePeriod = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['open', 'closed'].includes(status)) {
    throw new AppError('Status periode tidak valid', { code: 'VALIDATION_ERROR', status: 400 });
  }
  const { data: period, error } = await supabase
    .from('profit_periods')
    .update({ status })
    .eq('id', req.params.id)
    .select('id, year, start_date, end_date, status')
    .single();
  if (error) throw error;
  if (!period) throw notFound('Periode tidak ditemukan');
  return ok(res, period, 'Periode diperbarui');
});

export const listShares = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const year = Number(req.query.year);
  let periodId = req.query.period_id;

  if (!periodId) {
    if (!Number.isInteger(year)) throw new AppError('Parameter year wajib diisi', { code: 'VALIDATION_ERROR', status: 400 });
    const { data: period } = await supabase.from('profit_periods').select('id').eq('year', year).maybeSingle();
    if (!period) return ok(res, { year, period_id: null, items: [], totals: null, total: 0, page, pageSize, totalPages: 1 });
    periodId = period.id;
  }

  let query = supabase.from('customer_profit_shares').select(SHARE_SELECT).eq('period_id', periodId);
  if (req.query.status === 'paid' || req.query.status === 'unpaid') {
    query = query.eq('status', req.query.status);
  }

  const { data, error } = await query.order('total_profit', { ascending: false });
  if (error) throw error;

  const { data: distributions } = await supabase
    .from('profit_distributions')
    .select('customer_id, amount')
    .eq('period_id', periodId);
  const distByCustomer = {};
  (distributions || []).forEach((d) => {
    distByCustomer[d.customer_id] = (distByCustomer[d.customer_id] || 0) + Number(d.amount || 0);
  });

  const allItems = (data || []).map((s) => {
    const distributed = round2(distByCustomer[s.customer_id] || 0);
    return {
      ...s,
      distributed,
      remaining: round2(Number(s.share_amount) - distributed),
    };
  });

  const totals = {
    customers: allItems.length,
    total_purchase: Math.round(allItems.reduce((a, s) => a + Number(s.total_purchase), 0) * 100) / 100,
    total_profit: Math.round(allItems.reduce((a, s) => a + Number(s.total_profit), 0) * 100) / 100,
    share: Math.round(allItems.reduce((a, s) => a + Number(s.share_amount), 0) * 100) / 100,
    distributed: Math.round(allItems.reduce((a, s) => a + s.distributed, 0) * 100) / 100,
    remaining: Math.round(allItems.reduce((a, s) => a + s.remaining, 0) * 100) / 100,
  };

  const total = allItems.length;
  const from = (page - 1) * pageSize;
  const items = allItems.slice(from, from + pageSize);

  return ok(res, { year: year || null, period_id: periodId, items, totals, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 });
});

export const listDistributions = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);

  let periodId = null;
  if (req.query.year) {
    const { data: period } = await supabase.from('profit_periods').select('id').eq('year', Number(req.query.year)).maybeSingle();
    periodId = period?.id || null;
  } else if (req.query.period_id) {
    periodId = req.query.period_id;
  }

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('profit_distributions').select(select, opts);
      if (periodId) query = query.eq('period_id', periodId);
      return query;
    },
    select: '*, period:profit_periods(year), customer:customers(id, name), distributor:users(id, username, profiles(full_name))',
    signature: countSignature('profit_distributions', [periodId]),
    page,
    pageSize,
    orderBy: 'distributed_at',
    ascending: false,
  });
  return ok(res, result);
});

export const distributeProfit = asyncHandler(async (req, res) => {
  const { period_id, customer_id, amount, note } = req.body;

  const { data: result, error } = await supabase.rpc('fn_distribute_profit', {
    p_period_id: period_id,
    p_customer_id: customer_id,
    p_amount: amount,
    p_created_by: req.user.id,
    p_note: note || null,
  });
  if (error) {
    throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  }
  return ok(res, result, 'Bagi hasil berhasil dibagikan');
});

// ============================================================
// NOTIFIKASI PENJUALAN (riwayat status sent/failed/read)
// ============================================================

export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 30), 100);

  const { data: all, error } = await supabase
    .from('notification_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const unread = (all || []).filter((n) => n.status === 'sent').length;

  let items = all || [];
  if (req.query.unread_only === 'true') items = items.filter((n) => n.status === 'sent');

  return ok(res, { unread, items: items.slice(0, limit) });
});

export const markNotificationsRead = asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('notification_logs')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('user_id', req.user.id)
    .eq('status', 'sent');
  if (error) throw error;
  return ok(res, null, 'Notifikasi ditandai sudah dibaca');
});

export const subscribePush = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint) throw new AppError('Endpoint subscription wajib diisi', { code: 'VALIDATION_ERROR', status: 400 });

  const { data: sub, error } = await supabase
    .from('notification_subscriptions')
    .upsert(
      { user_id: req.user.id, endpoint, keys: keys || {}, user_agent: req.headers['user-agent'] || null },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return ok(res, sub, 'Berlangganan notifikasi berhasil');
});

export const unsubscribePush = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) throw new AppError('Endpoint subscription wajib diisi', { code: 'VALIDATION_ERROR', status: 400 });
  const { error } = await supabase
    .from('notification_subscriptions')
    .delete()
    .eq('user_id', req.user.id)
    .eq('endpoint', endpoint);
  if (error) throw error;
  return ok(res, null, 'Berhenti berlangganan notifikasi');
});
