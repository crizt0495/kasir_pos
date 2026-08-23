export function validateSchema(schema, values) {
  const result = schema.safeParse(values);
  if (result.success) return { isValid: true, errors: {}, data: result.data };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { isValid: false, errors, data: null };
}

export const passwordRule = {
  min: (v) => v.length >= 8,
  letter: (v) => /[a-zA-Z]/.test(v),
  number: (v) => /[0-9]/.test(v),
};

export function validatePassword(v) {
  if (!v) return 'Password wajib diisi';
  if (v.length < 8) return 'Password minimal 8 karakter';
  if (!passwordRule.letter(v)) return 'Password harus mengandung huruf';
  if (!passwordRule.number(v)) return 'Password harus mengandung angka';
  return '';
}
