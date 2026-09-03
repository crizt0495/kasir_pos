import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, conflict, badRequest } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

/** Resolve kode permission menjadi id */
async function resolvePermissionIds(codes) {
  if (!codes || !codes.length) return [];
  const { data } = await supabase.from('permissions').select('id').in('code', codes);
  return (data || []).map((p) => p.id);
}

async function replaceRolePermissions(roleId, codes) {
  await supabase.from('role_permissions').delete().eq('role_id', roleId);
  const ids = await resolvePermissionIds(codes);
  if (ids.length) {
    await supabase.from('role_permissions').insert(ids.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })));
  }
  return ids.length;
}

/** Invalidasi session semua user dengan role tsb (token_version++) */
async function bumpUsersTokenVersion(roleId) {
  const { data: users } = await supabase.from('user_roles').select('user_id').eq('role_id', roleId);
  const userIds = (users || []).map((u) => u.user_id);
  if (!userIds.length) return;
  const { data: rows } = await supabase.from('users').select('id, token_version').in('id', userIds);
  await supabase.from('users').upsert(
    (rows || []).map((u) => ({ id: u.id, token_version: u.token_version + 1 }))
  );
}

export const listRoles = asyncHandler(async (req, res) => {
  const { page, pageSize, from, to } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);

  let query = supabase
    .from('roles')
    .select('*, role_permissions(permission_id), user_roles(user_id)', { count: 'exact' });

  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);

  const { data, count, error } = await query.order('name').range(from, to);
  if (error) throw error;

  const result = (data || []).map((r) => ({
    ...r,
    permission_count: r.role_permissions?.length || 0,
    user_count: r.user_roles?.length || 0,
    role_permissions: undefined,
    user_roles: undefined,
  }));
  return ok(res, buildPage(result, count || 0, page, pageSize));
});

export const getRole = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('roles')
    .select('*, role_permissions(permission:permissions(code, name, module))')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Role tidak ditemukan');
  return ok(res, {
    ...data,
    permissions: (data.role_permissions || []).map((rp) => rp.permission),
  });
});

export const createRole = asyncHandler(async (req, res) => {
  const { name, code, description, permission_codes } = req.body;

  const { data: existing } = await supabase.from('roles').select('id').eq('code', code).maybeSingle();
  if (existing) throw conflict('Kode role sudah digunakan', 'ROLE_CODE_TAKEN');

  const { data: role, error } = await supabase
    .from('roles')
    .insert({ name, code, description, created_by: req.user.id, updated_by: req.user.id })
    .select('id')
    .single();
  if (error) throw error;

  const permissionCount = await replaceRolePermissions(role.id, permission_codes);

  await writeAudit({
    user: req.user,
    action: 'ROLE_CREATED',
    module: 'roles',
    recordId: role.id,
    newData: { name, code, permission_count: permissionCount },
    req,
  });
  return created(res, { id: role.id }, 'Role berhasil dibuat');
});

export const updateRole = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { name, description, permission_codes } = req.body;

  const { data: existing, error: exErr } = await supabase
    .from('roles')
    .select('id, name, code, is_system')
    .eq('id', id)
    .maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw notFound('Role tidak ditemukan');

  // Proteksi role sistem: permission-nya tidak boleh diubah (hindari admin terkunci)
  if (existing.is_system && permission_codes !== undefined) {
    throw badRequest('Permission role sistem tidak dapat diubah', 'SYSTEM_ROLE');
  }

  const patch = { updated_by: req.user.id };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  await supabase.from('roles').update(patch).eq('id', id);

  let permissionCount = null;
  if (permission_codes !== undefined && !existing.is_system) {
    permissionCount = await replaceRolePermissions(id, permission_codes);
    await bumpUsersTokenVersion(id); // session user di role ini di-invalidasi
  }

  await writeAudit({
    user: req.user,
    action: 'ROLE_UPDATED',
    module: 'roles',
    recordId: id,
    oldData: { name: existing.name },
    newData: { ...patch, permission_count: permissionCount },
    req,
  });
  return ok(res, { id }, 'Role berhasil diperbarui');
});

export const deleteRole = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const { data: existing, error: exErr } = await supabase
    .from('roles')
    .select('id, name, code, is_system')
    .eq('id', id)
    .maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw notFound('Role tidak ditemukan');
  if (existing.is_system) throw badRequest('Role sistem tidak dapat dihapus', 'SYSTEM_ROLE');

  const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', id);
  if (count > 0) throw conflict('Role masih digunakan oleh user, tidak dapat dihapus', 'ROLE_IN_USE');

  await supabase.from('roles').delete().eq('id', id);
  await writeAudit({
    user: req.user,
    action: 'ROLE_DELETED',
    module: 'roles',
    recordId: id,
    newData: { name: existing.name, code: existing.code },
    req,
  });
  return ok(res, null, 'Role berhasil dihapus');
});

export const setRolePermissions = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { permission_codes } = req.body;

  const { data: existing } = await supabase.from('roles').select('id, name, is_system').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Role tidak ditemukan');

  // Proteksi role sistem: permission tidak boleh diubah lewat jalur mana pun
  if (existing.is_system) {
    throw badRequest('Permission role sistem tidak dapat diubah', 'SYSTEM_ROLE');
  }

  const count = await replaceRolePermissions(id, permission_codes);
  await bumpUsersTokenVersion(id);

  await writeAudit({
    user: req.user,
    action: 'ROLE_PERMISSIONS_UPDATED',
    module: 'roles',
    recordId: id,
    newData: { permission_count: count, codes: permission_codes },
    req,
  });
  return ok(res, { id, permission_count: count }, 'Permission role berhasil diperbarui');
});
