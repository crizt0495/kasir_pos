import { createClient } from '@supabase/supabase-js';
import { env, isTest } from './env.js';

/**
 * Supabase client dengan SERVICE ROLE KEY.
 * RAHASIA — hanya boleh dipakai di server, JANGAN pernah di frontend.
 * Service role menembus RLS, sehingga OTORISASI dilakukan di middleware
 * backend (requirePermission) untuk setiap request.
 */
let supabase = null;

if (!isTest) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi. API akan gagal saat query.');
  } else {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}

export { supabase };
