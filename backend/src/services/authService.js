import { supabase } from '../config/supabase.js';

/**
 * Muat user lengkap: profil, roles, dan Set permission.
 * Dipakai middleware requireAuth (cek aktif + token_version) dan login.
 */
export async function loadUserAuth(uid) {
  if (!supabase) return null;

  try {
    // Query 1: data user + profile + roles
    const { data: user, error } = await supabase
      .from('users')
      .select(
        'id, username, is_active, must_change_password, token_version, last_login_at, ' +
          'profiles(full_name, email, phone, avatar_url), user_roles(role:roles(id, name, code, is_system))'
      )
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('[loadUserAuth] user query error:', error);
      return null;
    }
    if (!user) return null;

    // Query 2: ambil permission codes per role (left join agar role tanpa permission tetap masuk)
    const roleIds = (user.user_roles || []).map((ur) => ur.role?.id).filter(Boolean);
    let permissions = new Set();
    if (roleIds.length) {
      const { data: rpRows, error: rpErr } = await supabase
        .from('role_permissions')
        .select('permission:permissions(code), role_id')
        .in('role_id', roleIds);

      if (rpErr) {
        console.error('[loadUserAuth] permissions query error:', rpErr);
      } else {
        (rpRows || []).forEach((rp) => {
          if (rp.permission?.code) permissions.add(rp.permission.code);
        });
      }
    }

    return {
      id: user.id,
      username: user.username,
      is_active: user.is_active,
      must_change_password: user.must_change_password,
      token_version: user.token_version,
      last_login_at: user.last_login_at,
      profile: user.profiles || null,
      roles: (user.user_roles || []).map((ur) => ur.role).filter(Boolean),
      permissions,
    };
  } catch (err) {
    console.error('[loadUserAuth] unexpected error:', err);
    return null;
  }
}

/** Bentuk payload session untuk dikirim ke frontend (tanpa data sensitif) */
export function serializeSession(user) {
  return {
    id: user.id,
    username: user.username,
    must_change_password: user.must_change_password,
    profile: user.profile,
    roles: user.roles,
    permissions: [...user.permissions].sort(),
  };
}
