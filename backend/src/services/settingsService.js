import { supabase } from '../config/supabase.js';
import { getCache, setCache, delCache } from '../middleware/cache.js';

const CACHE_KEY = 'settings:all';
const TTL = 60 * 1000; // 1 menit

export async function getSettings(force = false) {
  if (!supabase) return {};
  if (!force) {
    const cached = getCache(CACHE_KEY);
    if (cached) return cached;
  }
  const { data } = await supabase.from('settings').select('key, value');
  const map = {};
  (data || []).forEach((s) => {
    map[s.key] = s.value;
  });
  setCache(CACHE_KEY, map, TTL);
  return map;
}

export async function getSetting(key) {
  const all = await getSettings();
  return all[key] || {};
}

export function invalidateSettingsCache() {
  delCache(CACHE_KEY);
}
