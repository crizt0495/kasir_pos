/**
 * Performance monitoring middleware.
 * Log requests yang > threshold untuk identifikasi bottleneck.
 * Hanya aktif di production (atau saat env.PERF_LOG=true).
 */

const THRESHOLD_MS = parseInt(process.env.PERF_THRESHOLD || '500', 10);

export function performanceLog(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration >= THRESHOLD_MS) {
      console.log(
        `[perf] ${req.method} ${req.url} → ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
}

/**
 * Hitung estimated cost dari query Supabase berdasarkan parameter.
 * Gunakan sebagai guidance sebelum eksekusi query besar.
 */
export function estimateQueryCost({ limit, offset, tableSize }) {
  if (!tableSize) return null;
  const ratio = limit / tableSize;
  if (ratio > 0.5) return { risk: 'HIGH', message: 'Query mengambil >50% tabel' };
  if (ratio > 0.1) return { risk: 'MEDIUM', message: 'Query mengambil ~10-50% tabel' };
  return { risk: 'LOW', message: 'Query hanya mengambil <10% tabel' };
}

/**
 * Limit maksimum pageSize untuk mencegah query membaca terlalu banyak data.
 * @param {number} max - maksimum pageSize (default 100)
 */
export function enforceMaxPageSize(max = 100) {
  return (req, res, next) => {
    const pageSize = parseInt(req.query.pageSize, 10);
    if (pageSize && pageSize > max) {
      req.query.pageSize = max;
    }
    next();
  };
}