export class AppError extends Error {
  constructor(message, { code = 'ERROR', status = 400, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST') => new AppError(message, { code, status: 400 });
export const unauthorized = (message = 'Anda belum login', code = 'UNAUTHORIZED') =>
  new AppError(message, { code, status: 401 });
export const forbidden = (message = 'Anda tidak memiliki akses') => new AppError(message, { code: 'FORBIDDEN', status: 403 });
export const notFound = (message = 'Data tidak ditemukan') => new AppError(message, { code: 'NOT_FOUND', status: 404 });
export const conflict = (message, code = 'CONFLICT') => new AppError(message, { code, status: 409 });

/**
 * Ekstrak pesan error dari Postgres RPC (raise exception → errcode P0001).
 * supabase-js membungkus pesan + context; kita ambil baris pesan utamanya.
 */
export function extractPgMessage(err) {
  if (!err) return 'Terjadi kesalahan';
  const lines = String(err.message || '').split('\n');
  const main = lines.find((l) => {
    const t = l.trim();
    return t && !t.startsWith('CONTEXT') && !t.startsWith('PL/pgSQL') && !t.startsWith('HINT') && !t.startsWith('DETAIL');
  });
  return (main || 'Terjadi kesalahan').replace(/^P0001\s*/, '').trim();
}
