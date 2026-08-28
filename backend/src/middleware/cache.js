/**
 * In-memory cache dengan TTL (Time-To-Live)
 * Untuk serverless: cache ini di-reset setiap cold start (normal)
 * Gunakan untuk data yang jarang berubah: settings, roles, permissions, master data
 * 
 * Untuk Vercel serverless: setiap function instance punya cache sendiri,
 * jadi cache tidak di-share antar request (cold start = new instance).
 * Gunakan untuk data yang di-fetch per-request dengan cost tinggi.
 */

const cache = new Map();

const DEFAULT_TTL = 60 * 1000; // 1 menit default

export function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

export function setCache(key, value, ttl = DEFAULT_TTL) {
  const expiresAt = Date.now() + ttl;
  cache.set(key, { value, expiresAt });
}

export function delCache(key) {
  cache.delete(key);
}

export function clearCache() {
  cache.clear();
}

export function cacheKeys(pattern) {
  const keys = [...cache.keys()];
  return keys.filter(key => key.includes(pattern));
}

export function delCachePattern(pattern) {
  const keys = cacheKeys(pattern);
  keys.forEach(key => cache.delete(key));
}

/**
 * Middleware wrapper untuk cache GET responses
 * @param {string} cacheKey - key unik untuk cache
 * @param {number} ttl - TTL dalam ms
 * @param {Function} handler - async function yang return data
 */
export async function withCache(cacheKey, ttl, handler) {
  const cached = getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const data = await handler();
  setCache(cacheKey, data, ttl);
  return data;
}

/**
 * Cache invalidation wrapper untuk POST/PUT/DELETE
 * @param {string} pattern - pattern key yang akan dihapus
 * @param {Function} handler - async function
 */
export async function withInvalidation(pattern, handler) {
  const result = await handler();
  delCachePattern(pattern);
  return result;
}

/**
 * Stats untuk monitoring (debugging)
 */
export function getCacheStats() {
  const entries = [...cache.entries()].map(([key, { expiresAt }]) => ({
    key,
    ttlRemaining: Math.max(0, expiresAt - Date.now()),
  }));

  return {
    size: cache.size,
    entries,
  };
}

/**
 * Auto-cleanup expired entries setiap 5 menit
 * Untuk environment yang survive > 5 menit (bukan serverless)
 */
let cleanupInterval;

export function startCacheCleanup(intervalMs = 5 * 60 * 1000) {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let deleted = 0;

    for (const [key, { expiresAt }] of cache.entries()) {
      if (now > expiresAt) {
        cache.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[cache] Cleaned up ${deleted} expired entries`);
    }
  }, intervalMs);
}

export function stopCacheCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
