import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { loadUserAuth, serializeSession } from '../services/authService.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { AppError, notFound, conflict, badRequest } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));

/** Resolve role refs (bisa id uuid atau code) menjadi array id role */
export async function resolveRoleIds(refs) {
  if (!refs || !refs.length) return [];
  // Kode role dibatasi karakter aman (huruf/angka/underscore/strip) agar tidak
  // bisa menyisipkan struktur filter ke dalam string .or() PostgREST
  const codes = refs
    .filter((r) => !isUuid(r))
    .map((r) => String(r).replace(/[^a-z0-9_-]/gi, '').slice(0, 50))
    .filter(Boolean);
  const ids = refs.filter((r) => isUuid(r));
  const filters = [];
  if (codes.length) filters.push(`code.in.(${codes.join(',')})`);
  if (ids.length) filters.push(`id.in.(${ids.join(',')})`);
  if (!filters.length) return [];
  const { data } = await supabase.from('roles').select('id').or(filters.join(','));
  return (data || []).map((r) => r.id);
}

export const listUsers = asyncHandler(async (req, res) => {
  const { page, pageSize, from, to } = getPagination(req.query);
  const q = safeSearch(req.query.search);
  const { is_active } = req.query;

  let query = supabase.from('v_users').select('*', { count: 'exact' });
  if (q) {
    query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (is_active === 'true' || is_active === 'false') {
    query = query.eq('is_active', is_active === 'true');
  }
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return ok(res, buildPage(data || [], count || 0, page, pageSize));
});

export const getUser = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('v_users')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('User tidak ditemukan');
  return ok(res, data);
});

export const createUser = asyncHandler(async (req, res) => {
  const data = req.body;
  const username = data.username.trim().toLowerCase();

  const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
  if (existing) throw conflict('Username sudah digunakan', 'USERNAME_TAKEN');

  const passwordHash = await bcrypt.hash(data.password, 10);
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      username,
      password_hash: passwordHash,
      is_active: data.is_active,
      must_change_password: data.must_change_password,
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('profiles').insert({
    id: user.id,
    full_name: data.full_name,
    email: data.email || null,
    phone: data.phone || null,
  });

  const roleIds = await resolveRoleIds(data.roles);
  if (roleIds.length) {
    await supabase.from('user_roles').insert(roleIds.map((roleId) => ({ user_id: user.id, role_id: roleId })));
  }

  await writeAudit({
    user: req.user,
    action: 'USER_CREATED',
    module: 'users',
    recordId: user.id,
    newData: { username, full_name: data.full_name, roles: data.roles },
    req,
  });

  const full = await loadUserAuth(user.id);
  return created(res, serializeSession(full), 'User berhasil dibuat');
});

export const updateUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const data = req.body;

  const { data: existing, error: exErr } = await supabase
    .from('users')
    .select('id, username, token_version, user_roles(role_id)')
    .eq('id', id)
    .maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw notFound('User tidak ditemukan');

  const oldRoles = (existing.user_roles || []).map((r) => r.role_id);
  const changes = {};

  // Proteksi: jangan nonaktifkan diri sendiri
  if (data.is_active === false && id === req.user.id) {
    throw badRequest('Tidak dapat menonaktifkan akun sendiri', 'SELF_ACTION');
  }

  const userPatch = { updated_by: req.user.id };
  if (data.password) {
    userPatch.password_hash = await bcrypt.hash(data.password, 10);
    userPatch.must_change_password = data.must_change_password ?? true;
    userPatch.token_version = existing.token_version + 1; // invalidasi session lama
    changes.password = 'diubah';
  }
  if (data.is_active !== undefined && data.is_active !== existing.is_active) {
    userPatch.is_active = data.is_active;
    userPatch.token_version = existing.token_version + 1;
    changes.is_active = data.is_active;
  }
  await supabase.from('users').update(userPatch).eq('id', id);

  const profilePatch = {};
  if (data.full_name !== undefined) profilePatch.full_name = data.full_name;
  if (data.email !== undefined) profilePatch.email = data.email || null;
  if (data.phone !== undefined) profilePatch.phone = data.phone || null;
  if (Object.keys(profilePatch).length) {
    await supabase.from('profiles').upsert({ id, ...profilePatch });
  }

  // Update roles
  if (data.roles) {
    if (id === req.user.id) {
      const roleIds = await resolveRoleIds(data.roles);
      const { data: selfRoles } = await supabase
        .from('roles')
        .select('id')
        .in('code', ['owner'])
        .in('id', roleIds);
      const removingOwner =
        oldRoles.some((r) => r === selfRoles?.[0]?.id) && !roleIds.includes(selfRoles?.[0]?.id);
      if (removingOwner) {
        throw badRequest('Tidak dapat menghapus role Owner dari akun sendiri', 'SELF_ACTION');
      }
    }
    const newRoleIds = await resolveRoleIds(data.roles);
    const toRemove = oldRoles.filter((r) => !newRoleIds.includes(r));
    const toAdd = newRoleIds.filter((r) => !oldRoles.includes(r));
    if (toRemove.length) {
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', id)
        .in('role_id', toRemove);
    }
    if (toAdd.length) {
      await supabase.from('user_roles').insert(toAdd.map((roleId) => ({ user_id: id, role_id: roleId })));
    }
    if (toRemove.length || toAdd.length) {
      await supabase.from('users').update({ token_version: existing.token_version + 1 }).eq('id', id);
      changes.roles = { removed: toRemove, added: toAdd };
    }
  }

  await writeAudit({
    user: req.user,
    action: 'USER_UPDATED',
    module: 'users',
    recordId: id,
    oldData: { is_active: existing.is_active, roles: oldRoles },
    newData: changes,
    req,
  });

  const full = await loadUserAuth(id);
  return ok(res, serializeSession(full), 'User berhasil diperbarui');
});

export const deleteUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) throw badRequest('Tidak dapat menghapus akun sendiri', 'SELF_ACTION');

  const { data: existing, error: exErr } = await supabase
    .from('users')
    .select('id, username, user_roles(role:roles(code, is_system))')
    .eq('id', id)
    .maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw notFound('User tidak ditemukan');

  const hasOwner = (existing.user_roles || []).some((r) => r.role?.code === 'owner');
  if (hasOwner) {
    throw badRequest('Tidak dapat menghapus user dengan role Owner', 'SYSTEM_ROLE');
  }

  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'USER_DELETED',
    module: 'users',
    recordId: id,
    newData: { username: existing.username },
    req,
  });
  return ok(res, null, 'User berhasil dihapus');
});

export { AppError };
