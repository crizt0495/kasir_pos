import { AppError } from '../utils/errors.js';

/**
 * Validasi Zod. source: 'body' | 'query' | 'params'
 * Data hasil validasi menggantikan req[source] (parse, bukan passthrough).
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      return next(
        new AppError(first.message, {
          code: 'VALIDATION_ERROR',
          status: 422,
          details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        })
      );
    }
    req[source] = result.data;
    return next();
  };
}
