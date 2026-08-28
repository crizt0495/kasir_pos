import { AppError, extractPgMessage } from '../utils/errors.js';
import { env } from '../config/env.js';

export function notFound(req, res) {
  return res.status(404).json({
    success: false,
    message: 'Endpoint tidak ditemukan',
    code: 'NOT_FOUND',
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Error aplikasi (AppError)
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Error dari fungsi Postgres RPC (raise exception)
  if (err && (err.code === 'P0001' || err.code === '23505' || err.code === '23503' || err.code === '23514')) {
    const message = extractPgMessage(err);
    return res.status(400).json({ success: false, message, code: 'BAD_REQUEST' });
  }

  // Error validasi JSON body
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Format JSON tidak valid', code: 'INVALID_JSON' });
  }

  // ZOD / JWT error umum
  if (err && err.name === 'ZodError') {
    return res.status(422).json({ success: false, message: 'Data tidak valid', code: 'VALIDATION_ERROR' });
  }

  // Error tak terduga — jangan tampilkan stack trace ke user
  console.error('[ERROR]', err && err.stack ? err.stack : err);
  if (env && env.NODE_ENV === 'production') {
    // Log error untuk debugging di Vercel logs
    console.error('[ERROR_DETAIL]', JSON.stringify({
      message: err && err.message,
      code: err && err.code,
      url: req && req.originalUrl,
      method: req && req.method,
      stack: err && err.stack && err.stack.split('\n').slice(0, 5).join('\n'),
    }));
  }
  return res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan, silakan coba lagi',
    code: 'INTERNAL_ERROR',
  });
}
