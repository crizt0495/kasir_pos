export function getPagination(query = {}, defaultPageSize = 20, maxPageSize = 100) {
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
