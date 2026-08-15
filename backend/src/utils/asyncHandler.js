/** Bungkus async handler agar error diteruskan ke errorHandler Express */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
