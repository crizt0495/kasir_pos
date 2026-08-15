import { supabase } from '../config/supabase.js';

let cache = null;
let cacheAt = 0;
const TTL = 60_000; // 1 menit

export async function getSettings(force = false) {
  if (!supabase) return {};
  if (cache && !force && Date.now() - cacheAt < TTL) return cache;
  const { data } = await supabase.from('settings').select('key, value');
  const map = {};
  (data || []).forEach((s) => {
    map[s.key] = s.value;
  });
  cache = map;
  cacheAt = Date.now();
  return map;
}

export async function getSetting(key) {
  const all = await getSettings();
  return all[key] || {};
}

export function invalidateSettingsCache() {
  cache = null;
}
