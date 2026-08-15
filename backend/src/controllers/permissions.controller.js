import { supabase } from '../config/supabase.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listPermissions = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('permissions').select('*').order('module').order('code');
  if (error) throw error;

  // Kelompokkan per modul
  const grouped = {};
  (data || []).forEach((p) => {
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  });

  return ok(res, { all: data || [], grouped });
});
