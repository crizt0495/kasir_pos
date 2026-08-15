import { supabase } from '../config/supabase.js';

/**
 * Catat aktivitas penting ke audit_logs.
 * req opsional — dipakai untuk IP & user agent.
 */
export async function writeAudit({ user, action, module, recordId = null, oldData = null, newData = null, req = null }) {
  if (!supabase) return;
  const ip =
    req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null;

  const { error } = await supabase.from('audit_logs').insert({
    user_id: user?.id ?? null,
    username: user?.username ?? null,
    action,
    module,
    record_id: recordId,
    ip_address: ip,
    user_agent: req?.get?.('user-agent') || null,
    old_data: oldData,
    new_data: newData,
  });
  if (error) console.error('[audit]', error.message);
}
