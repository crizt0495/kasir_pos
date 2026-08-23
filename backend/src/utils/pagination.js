export function getPagination(query = {}, defaultPageSize = 20, maxPageSize = 250) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(query.pageSize, 10) || defaultPageSize));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

export function buildPage(items, total, page, pageSize) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Konversi "YYYY-MM-DD" menjadi range ISO untuk filter created_at */
export function dateRange(from, to) {
  const range = {};
  if (from) range.gte = `${from}T00:00:00.000Z`;
  if (to) range.lte = `${to}T23:59:59.999Z`;
  return range;
}

// ============================================================
// CACHE COUNT — COUNT(*) exact pada tabel besar mahal.
// Total di-cache per kombinasi FILTER (bukan halaman/sort) selama
// TTL singkat, sehingga navigasi halaman & sorting tidak mengulang
// COUNT. Staleness maksimal TTL detik setelah mutasi.
// ============================================================
const countCache = new Map();
const COUNT_TTL_MS = 20_000;
const COUNT_CACHE_MAX = 500;

export function countSignature(table, params) {
  return `${table}:${JSON.stringify(params ?? null)}`;
}

export async function cachedTotal(signature, runCount) {
  const now = Date.now();
  const hit = countCache.get(signature);
  if (hit && now - hit.at < COUNT_TTL_MS) return hit.total;
  const total = await runCount();
  if (countCache.size >= COUNT_CACHE_MAX) countCache.clear();
  countCache.set(signature, { total, at: now });
  return total;
}

export function invalidateCounts(prefix) {
  if (!prefix) return countCache.clear();
  for (const key of countCache.keys()) {
    if (key.startsWith(prefix)) countCache.delete(key);
  }
}

/**
 * Query halaman server-side dengan COUNT terpisah yang di-cache.
 *
 * @param {Function} buildQuery (select, opts) => query builder supabase.
 *   Harus sudah memuat SELECT + semua FILTER, TANPA order/range.
 * @param {string} select kolom untuk query data (hindari `*` bila tak perlu)
 * @param {string} signature kunci cache count (kombinasi filter saja)
 * @param {number} page mulai dari 1
 * @param {string} orderBy kolom order — WAJIB dari whitelist controller
 */
export async function fetchPage({
  buildQuery,
  select = '*',
  signature,
  page,
  pageSize,
  orderBy,
  ascending = false,
}) {
  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;

  const runCount = async () => {
    const { count, error } = await buildQuery('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  };
  const total = signature ? await cachedTotal(signature, runCount) : await runCount();

  let query = buildQuery(select);
  if (orderBy) query = query.order(orderBy, { ascending });
  const { data, error } = await query.range(from, to);
  if (error) throw error;

  return buildPage(data || [], total, page, pageSize);
}
