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

/** Matriks permission ↔ role (untuk halaman kelola membership per-permission) */
export const getPermissionMatrix = asyncHandler(async (req, res) => {
  const [{ data: perms }, { data: roles }] = await Promise.all([
    supabase.from('permissions').select('*').order('module').order('code'),
    supabase.from('roles').select('*, role_permissions(permission:permissions(code))').order('name'),
  ]);

  return ok(res, {
    permissions: perms || [],
    roles: (roles || []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      is_system: r.is_system,
      permission_codes: (r.role_permissions || []).map((rp) => rp.permission?.code).filter(Boolean),
    })),
  });
});
