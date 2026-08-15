/** Format response sukses: { success: true, message, data } */
export function ok(res, data = null, message = 'Berhasil', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function created(res, data = null, message = 'Berhasil dibuat') {
  return ok(res, data, message, 201);
}

/** Format response error: { success: false, message, code } */
export function fail(res, message, code = 'ERROR', status = 400) {
  return res.status(status).json({ success: false, message, code });
}
