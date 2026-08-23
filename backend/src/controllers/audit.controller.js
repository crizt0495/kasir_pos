import { supabase } from '../config/supabase.js';
import { fetchPage, countSignature } from '../utils/pagination.js';
import { getPagination } from '../utils/pagination.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { module, action, user_id } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('audit_logs').select(select, opts);
      if (q) query = query.or(`username.ilike.%${q}%,action.ilike.%${q}%`);
      if (module) query = query.eq('module', module);
      if (action) query = query.eq('action', action);
      if (user_id) query = query.eq('user_id', user_id);
      if (req.query.from) query = query.gte('created_at', `${req.query.from}T00:00:00.000Z`);
      if (req.query.to) query = query.lte('created_at', `${req.query.to}T23:59:59.999Z`);
      return query;
    },
    select: '*, user:users(username)',
    signature: countSignature('audit_logs', [q, module, action, user_id, req.query.from, req.query.to]),
    page,
    pageSize,
    orderBy: 'created_at',
    ascending: false,
  });
  return ok(res, result);
});
