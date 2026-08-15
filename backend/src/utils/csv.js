function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Buat CSV (separator ; + BOM UTF-8 agar terbuka rapi di Excel id-ID).
 * columns: [{ key, label }]
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(';');
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(';'));
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

export function csvResponse(res, csv, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}
