import { supabase } from '../config/supabase.js';
import { getPagination, buildPage } from '../utils/pagination.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { module, action, user_id } = req.query;

  let query = supabase
    .from('audit_logs')
    .select('*, user:users(username)', { count: 'exact' });

  if (q) query = query.or(`username.ilike.%${q}%,action.ilike.%${q}%`);
  if (module) query = query.eq('module', module);
  if (action) query = query.eq('action', action);
  if (user_id) query = query.eq('user_id', user_id);
  if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
  if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);

  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  return ok(res, buildPage(data || [], count || 0, page, pageSize));
});
