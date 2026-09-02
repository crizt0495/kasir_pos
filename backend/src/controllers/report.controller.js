import { supabase } from '../config/supabase.js';
import { ok } from '../utils/response.js';
import { toCsv, csvResponse } from '../utils/csv.js';
import { buildExcel, excelResponse, buildPdf, pdfResponse } from '../utils/export.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Laporan memakai zona waktu WIB (UTC+7) untuk pembagian harian/mingguan/bulanan
const WIB_OFFSET = 7 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');

const toWib = (d) => new Date(new Date(d).getTime() + WIB_OFFSET);
const dayKey = (d) => {
  const w = toWib(d);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
};
const weekKey = (d) => {
  const w = toWib(d);
  const dow = (w.getUTCDay() + 6) % 7; // Senin = 0
  const monday = new Date(w);
  monday.setUTCDate(w.getUTCDate() - dow);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
};
const monthKey = (d) => {
  const w = toWib(d);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}`;
};

const keyOf = { daily: dayKey, weekly: weekKey, monthly: monthKey };

function toIso(dateStr, endOfDay = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - WIB_OFFSET + (endOfDay ? 86400000 - 1 : 0);
  return new Date(ms).toISOString();
}

const todayWib = () => {
  const w = toWib(Date.now());
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
};

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Bangun rentang laporan sesuai period & tanggal custom */
function buildRange(period, from, to) {
  const today = todayWib();
  const start = from || addDays(today, -(period === 'monthly' ? 365 : period === 'weekly' ? 84 : 30));
  const end = to || today;

  if (period === 'monthly') {
    const keys = [];
    let [y, m] = start.slice(0, 7).split('-').map(Number);
    const endKey = end.slice(0, 7);
    while (`${y}-${pad(m)}` <= endKey && keys.length < 36) {
      keys.push(`${y}-${pad(m)}`);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return { start, end, keys };
  }
  if (period === 'weekly') {
    const keys = [];
    let cur = weekKey(toIso(start));
    const endKey = weekKey(toIso(end));
    while (cur <= endKey && keys.length < 60) {
      keys.push(cur);
      cur = weekKey(toIso(addDays(cur, 7)));
    }
    return { start, end, keys };
  }
  // daily / custom
  const keys = [];
  let cur = start;
  while (cur <= end && keys.length < 370) {
    keys.push(cur);
    cur = addDays(cur, 1);
  }
  return { start, end, keys };
}

/** Ambil semua id penjualan dalam rentang (status != cancelled) */
async function fetchSaleIds(startIso, endIso) {
  const { data } = await supabase
    .from('sales')
    .select('id, total, profit, created_at, cashier_id, payment_method, status, discount, tax')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .neq('status', 'cancelled');
  return data || [];
}

/** Ambil sale_items dalam rentang via chunk id (hindari limit parameter URL) */
async function fetchSaleItemsInRange(startIso, endIso) {
  const { data: sales } = await supabase
    .from('sales')
    .select('id')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .neq('status', 'cancelled');
  const ids = (sales || []).map((s) => s.id);
  const results = [];
  for (let i = 0; i < ids.length; i += 900) {
    const chunk = ids.slice(i, i + 900);
    const { data } = await supabase
      .from('sale_items')
      .select('quantity, price, discount, subtotal, sale_id, products(purchase_price, name, sku, category:categories(id, name))')
      .in('sale_id', chunk);
    results.push(...(data || []));
  }
  return results;
}

const bucketize = (rows, period, keys, valueFn) => {
  const buckets = {};
  keys.forEach((k) => { buckets[k] = { label: k, sales: 0, transactions: 0, discount: 0, tax: 0, refunds: 0 }; });
  rows.forEach((r) => {
    const k = keyOf[period](r.created_at);
    const b = buckets[k] || (buckets[k] = { label: k, sales: 0, transactions: 0, discount: 0, tax: 0, refunds: 0 });
    if (valueFn) valueFn(b, r);
  });
  return buckets;
};

// ============================================================
// LAPORAN PENJUALAN
// ============================================================
export const salesReport = asyncHandler(async (req, res) => {
  const period = ['daily', 'weekly', 'monthly', 'custom'].includes(req.query.period) ? req.query.period : 'daily';
  const { start, end, keys } = buildRange(period, req.query.from, req.query.to);
  const startIso = toIso(start);
  const endIso = toIso(end, true);

  let query = supabase
    .from('sales')
    .select('id, total, created_at, cashier_id, payment_method, status, discount, tax')
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (req.query.cashier_id) query = query.eq('cashier_id', req.query.cashier_id);
  if (req.query.payment_method) query = query.eq('payment_method', req.query.payment_method);

  const { data } = await query;
  const sales = (data || []).filter((s) => s.status !== 'cancelled');

  const buckets = bucketize(sales, period, keys, (b, s) => {
    b.sales += Number(s.total);
    b.transactions += 1;
    b.discount += Number(s.discount || 0);
    b.tax += Number(s.tax || 0);
  });

  const { data: returns } = await supabase
    .from('returns')
    .select('created_at, total_refund')
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  (returns || []).forEach((r) => {
    const k = keyOf[period](r.created_at);
    if (buckets[k]) buckets[k].refunds += Number(r.total_refund || 0);
  });

  const totals = Object.values(buckets).reduce(
    (acc, b) => {
      acc.sales += b.sales;
      acc.transactions += b.transactions;
      acc.refunds += b.refunds;
      acc.discount += b.discount;
      acc.tax += b.tax;
      return acc;
    },
    { sales: 0, transactions: 0, refunds: 0, discount: 0, tax: 0 }
  );
  totals.net = totals.sales - totals.refunds;

  const paymentMethods = {};
  sales.forEach((s) => {
    paymentMethods[s.payment_method] = (paymentMethods[s.payment_method] || 0) + Number(s.total);
  });

   const result = { period, from: start, to: end, buckets: Object.values(buckets), totals, payment_methods: paymentMethods };

  if (req.query.export === 'csv') {
    const csv = toCsv(Object.values(buckets), [
      { key: 'label', label: 'Tanggal' },
      { key: 'transactions', label: 'Jumlah Transaksi' },
      { key: 'sales', label: 'Penjualan' },
      { key: 'refunds', label: 'Retur' },
      { key: 'net', label: 'Net' },
    ]);
    return csvResponse(res, csv, `laporan-penjualan-${start}-${end}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('sales', result, { from: start, to: end });
    return excelResponse(res, workbook, `laporan-penjualan-${start}-${end}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('sales', result, { from: start, to: end });
    return pdfResponse(res, buffer, `laporan-penjualan-${start}-${end}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// LAPORAN PROFIT
// ============================================================
export const profitReport = asyncHandler(async (req, res) => {
  const period = ['daily', 'weekly', 'monthly', 'custom'].includes(req.query.period) ? req.query.period : 'daily';
  const { start, end, keys } = buildRange(period, req.query.from, req.query.to);
  const startIso = toIso(start);
  const endIso = toIso(end, true);

  // Profit memakai SNAPSHOT harga beli saat transaksi (sales.profit),
  // sudah dikoreksi retur — perubahan harga produk tidak mengubah laba lama.
  const sales = await fetchSaleIds(startIso, endIso);

  const buckets = {};
  keys.forEach((k) => { buckets[k] = { label: k, revenue: 0, cogs: 0, profit: 0, transactions: 0 }; });

  sales.forEach((s) => {
    const b = buckets[keyOf[period](s.created_at)] || (buckets[keyOf[period](s.created_at)] = { label: keyOf[period](s.created_at), revenue: 0, cogs: 0, profit: 0, transactions: 0 });
    b.revenue += Number(s.total);
    b.profit += Number(s.profit || 0);
    b.cogs += Number(s.total || 0) - Number(s.profit || 0);
    b.transactions += 1;
  });
  Object.values(buckets).forEach((b) => {
    b.revenue = Math.round(b.revenue * 100) / 100;
    b.cogs = Math.round(b.cogs * 100) / 100;
    b.profit = Math.round(b.profit * 100) / 100;
  });

  const totals = Object.values(buckets).reduce(
    (acc, b) => {
      acc.revenue += b.revenue;
      acc.cogs += b.cogs;
      acc.profit += b.profit;
      acc.transactions += b.transactions;
      return acc;
    },
    { revenue: 0, cogs: 0, profit: 0, transactions: 0 }
  );

  const result = { period, from: start, to: end, buckets: Object.values(buckets), totals };
  if (req.query.export === 'csv') {
    const csv = toCsv(Object.values(buckets), [
      { key: 'label', label: 'Periode' },
      { key: 'transactions', label: 'Transaksi' },
      { key: 'revenue', label: 'Pendapatan' },
      { key: 'cogs', label: 'HPP' },
      { key: 'profit', label: 'Profit' },
    ]);
    return csvResponse(res, csv, `laporan-profit-${start}-${end}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('profit', result, { from: start, to: end });
    return excelResponse(res, workbook, `laporan-profit-${start}-${end}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('profit', result, { from: start, to: end });
    return pdfResponse(res, buffer, `laporan-profit-${start}-${end}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// LAPORAN PRODUK (terlaris & paling sedikit terjual)
// ============================================================
export const productsReport = asyncHandler(async (req, res) => {
  const { start: from, end: to } = buildRange('custom', req.query.from || addDays(todayWib(), -30), req.query.to);
  const startIso = toIso(from);
  const endIso = toIso(to, true);

  const items = await fetchSaleItemsInRange(startIso, endIso);
  const byProduct = {};
  items.forEach((it) => {
    const key = it.products?.id || 'unknown';
    if (!byProduct[key]) byProduct[key] = { name: it.products?.name || 'Produk dihapus', sku: it.products?.sku || '', quantity: 0, revenue: 0 };
    byProduct[key].quantity += Number(it.quantity);
    byProduct[key].revenue += Number(it.subtotal);
  });

  const rows = Object.values(byProduct);
  const top = [...rows].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const least = [...rows].sort((a, b) => a.quantity - b.quantity).slice(0, 10);

  const result = { from, to, top, least, total_products_sold: rows.length };
  if (req.query.export === 'csv') {
    const csv = toCsv([...top, ...least], [
      { key: 'name', label: 'Produk' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Jumlah Terjual' },
      { key: 'revenue', label: 'Pendapatan' },
    ]);
    return csvResponse(res, csv, `laporan-produk-${from}-${to}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('products', result, { from, to });
    return excelResponse(res, workbook, `laporan-produks-${from}-${to}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('products', result, { from, to });
    return pdfResponse(res, buffer, `laporan-produks-${from}-${to}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// LAPORAN STOK
// ============================================================
export const inventoryReport = asyncHandler(async (req, res) => {
  const { start: from, end: to } = buildRange('custom', req.query.from || addDays(todayWib(), -30), req.query.to);
  const startIso = toIso(from);
  const endIso = toIso(to, true);

  const { data: products } = await supabase.from('products').select('id, name, sku, stock, min_stock, status');
  const all = products || [];
  const available = all.filter((p) => Number(p.stock) > 0);
  const low = all.filter((p) => Number(p.stock) <= Number(p.min_stock) && Number(p.stock) > 0);
  const out = all.filter((p) => Number(p.stock) <= 0);

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('type, quantity, created_at')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const movementSummary = {};
  (movements || []).forEach((m) => {
    const t = m.type;
    if (!movementSummary[t]) movementSummary[t] = { type: t, in: 0, out: 0, count: 0 };
    if (Number(m.quantity) >= 0) movementSummary[t].in += Number(m.quantity);
    else movementSummary[t].out += Math.abs(Number(m.quantity));
    movementSummary[t].count += 1;
  });

  const result = {
    from,
    to,
    totals: { total_products: all.length, available: available.length, low_stock: low.length, out_of_stock: out.length },
    low_stock_list: low.slice(0, 50),
    out_of_stock_list: out.slice(0, 50),
    movements: Object.values(movementSummary),
    inventory_list: all,
  };

  if (req.query.export === 'csv') {
    const csv = toCsv(all, [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Produk' },
      { key: 'stock', label: 'Stok' },
      { key: 'min_stock', label: 'Stok Min' },
      { key: 'status', label: 'Status' },
    ]);
    return csvResponse(res, csv, `laporan-stok-${from}-${to}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('inventory', result, { from, to });
    return excelResponse(res, workbook, `laporan-stok-${from}-${to}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('inventory', result, { from, to });
    return pdfResponse(res, buffer, `laporan-stok-${from}-${to}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// LAPORAN KASIR
// ============================================================
export const cashierReport = asyncHandler(async (req, res) => {
  const { start: from, end: to } = buildRange('custom', req.query.from || addDays(todayWib(), -30), req.query.to);
  const startIso = toIso(from);
  const endIso = toIso(to, true);

  let query = supabase
    .from('sales')
    .select('id, total, cashier_id, payment_method, status, users!sales_cashier_id_fkey(cashier_username: username, cashier_name: profiles(full_name))')
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  const { data } = await query;

  const byCashier = {};
  (data || []).forEach((s) => {
    if (s.status === 'cancelled') return;
    const key = s.cashier_id || 'unknown';
    if (!byCashier[key]) {
      byCashier[key] = {
        cashier_id: s.cashier_id,
        username: s.users?.cashier_username || '-',
        full_name: s.users?.cashier_name?.full_name || s.users?.cashier_name || '-',
        transactions: 0,
        total: 0,
        payment_methods: {},
      };
    }
    const c = byCashier[key];
    c.transactions += 1;
    c.total += Number(s.total);
    c.payment_methods[s.payment_method] = (c.payment_methods[s.payment_method] || 0) + Number(s.total);
  });

  const result = { from, to, cashiers: Object.values(byCashier) };
  if (req.query.export === 'csv') {
    const csv = toCsv(Object.values(byCashier), [
      { key: 'full_name', label: 'Kasir' },
      { key: 'username', label: 'Username' },
      { key: 'transactions', label: 'Transaksi' },
      { key: 'total', label: 'Total Penjualan' },
    ]);
    return csvResponse(res, csv, `laporan-kasir-${from}-${to}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('cashier', result, { from, to });
    return excelResponse(res, workbook, `laporan-kasir-${from}-${to}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('cashier', result, { from, to });
    return pdfResponse(res, buffer, `laporan-kasir-${from}-${to}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// LAPORAN PEMBELIAN
// ============================================================
export const purchasesReport = asyncHandler(async (req, res) => {
  const { start: from, end: to } = buildRange('custom', req.query.from || addDays(todayWib(), -30), req.query.to);
  const startIso = toIso(from);
  const endIso = toIso(to, true);

  const { data } = await supabase
    .from('purchases')
    .select('id, total, status, purchase_date, supplier:suppliers(name)')
    .gte('purchase_date', from)
    .lte('purchase_date', to);

  const rows = (data || []).filter((p) => p.status !== 'cancelled');
  const totals = { count: rows.length, total: rows.reduce((a, p) => a + Number(p.total), 0) };

  const bySupplier = {};
  rows.forEach((p) => {
    const name = p.supplier?.name || '-';
    if (!bySupplier[name]) bySupplier[name] = { supplier: name, count: 0, total: 0 };
    bySupplier[name].count += 1;
    bySupplier[name].total += Number(p.total);
  });

  const result = { from, to, totals, suppliers: Object.values(bySupplier) };
  if (req.query.export === 'csv') {
    const csv = toCsv(Object.values(bySupplier), [
      { key: 'supplier', label: 'Supplier' },
      { key: 'count', label: 'Jumlah Pembelian' },
      { key: 'total', label: 'Total' },
    ]);
    return csvResponse(res, csv, `laporan-pembelian-${from}-${to}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('purchases', result, { from, to });
    return excelResponse(res, workbook, `laporan-pembelian-${from}-${to}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('purchases', result, { from, to });
    return pdfResponse(res, buffer, `laporan-pembelian-${from}-${to}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// LAPORAN HUTANG / PIUTANG (spec §15)
// ============================================================
export const debtReport = asyncHandler(async (req, res) => {
  const period = ['daily', 'weekly', 'monthly', 'custom'].includes(req.query.period) ? req.query.period : 'daily';
  const { start, end } = buildRange(period, req.query.from, req.query.to);
  const startIso = toIso(start);
  const endIso = toIso(end, true);

  let debtsQuery = supabase
    .from('customer_debts')
    .select(
      'id, customer:customers(id, name, phone), amount, paid_amount, remaining_amount, due_date, status, created_at, sale_id',
      { count: 'exact' }
    )
    .neq('status', 'cancelled');

  if (req.query.customer_id) debtsQuery = debtsQuery.eq('customer_id', req.query.customer_id);
  if (req.query.status) debtsQuery = debtsQuery.eq('status', req.query.status);
  debtsQuery = debtsQuery.gte('created_at', startIso).lte('created_at', endIso);

  const { data: debts, count } = await debtsQuery.order('created_at', { ascending: false });

  const rows = debts || [];
  const totals = {
    total_debt: rows.reduce((a, d) => a + Number(d.amount || 0), 0),
    total_pending: rows.reduce((a, d) => a + Math.max(0, Number(d.remaining_amount || 0)), 0),
    total_paid: rows.reduce((a, d) => a + Number(d.paid_amount || 0), 0),
    total_overdue: rows.reduce((a, d) => a + (d.status === 'overdue' ? Math.max(0, Number(d.remaining_amount || 0)) : 0), 0),
    records_count: count || 0,
    customers_count: new Set(rows.map((d) => d.customer_id)).size,
    pending_count: rows.filter((d) => d.status === 'pending' || d.status === 'partial').length,
  };

  const result = { period, from: start, to: end, totals, debts: rows };

  if (req.query.export === 'csv') {
    const csv = toCsv(rows, [
      { key: (r) => r.customer?.name || '-', label: 'Pelanggan' },
      { key: 'amount', label: 'Total Hutang' },
      { key: 'paid_amount', label: 'Sudah Dibayar' },
      { key: 'remaining_amount', label: 'Sisa Hutang' },
      { key: 'due_date', label: 'Jatuh Tempo' },
      { key: 'status', label: 'Status' },
    ]);
    return csvResponse(res, csv, `laporan-hutang-${start}-${end}.csv`);
  }
  if (req.query.export === 'xlsx') {
    const workbook = await buildExcel('debt', result, { from: start, to: end });
    return excelResponse(res, workbook, `laporan-hutang-${start}-${end}.xlsx`);
  }
  if (req.query.export === 'pdf') {
    const buffer = await buildPdf('debt', result, { from: start, to: end });
    return pdfResponse(res, buffer, `laporan-hutang-${start}-${end}.pdf`);
  }
  return ok(res, result);
});

// ============================================================
// DASHBOARD — ringkasan
// ============================================================
export const dashboardSummary = asyncHandler(async (req, res) => {
  const today = todayWib();
  const startIso = toIso(today);
  const endIso = toIso(today, true);

  const [salesRes, returnsRes, productsRes, customersRes, purchasesRes, sessionsRes] = await Promise.all([
    supabase.from('sales').select('total, profit, status').gte('created_at', startIso).lte('created_at', endIso),
    supabase.from('returns').select('total_refund').gte('created_at', startIso).lte('created_at', endIso),
    supabase.from('products').select('id, stock, min_stock'),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('purchases').select('total, status').gte('purchase_date', today).lte('purchase_date', today),
    supabase.from('cash_sessions').select('id, opening_balance, status').eq('status', 'open'),
  ]);

  const validSales = (salesRes.data || []).filter((s) => s.status !== 'cancelled');
  const todaySales = validSales.reduce((a, s) => a + Number(s.total), 0);
  const todayCount = validSales.length;
  const todayRefund = (returnsRes.data || []).reduce((a, r) => a + Number(r.total_refund), 0);

  // Profit memakai snapshot harga beli saat transaksi (sudah dikoreksi retur)
  const profit = validSales.reduce((a, s) => a + Number(s.profit || 0), 0);

  const products = productsRes.data || [];
  const lowStock = products.filter((p) => Number(p.stock) <= Number(p.min_stock) && Number(p.stock) > 0).length;
  const outOfStock = products.filter((p) => Number(p.stock) <= 0).length;

  const purchasesToday = (purchasesRes.data || [])
    .filter((p) => p.status !== 'cancelled')
    .reduce((a, p) => a + Number(p.total), 0);

  // Kas saat ini (semua sesi terbuka: saldo awal + transaksi)
  // Satu query untuk SEMUA sesi (hindari pola N+1)
  const sessions = sessionsRes.data || [];
  let openCash = 0;
  if (sessions.length) {
    const sessionIds = sessions.map((s) => s.id);
    const { data: txns } = await supabase
      .from('cash_transactions')
      .select('session_id, amount')
      .in('session_id', sessionIds);
    const bySession = {};
    (txns || []).forEach((t) => {
      bySession[t.session_id] = (bySession[t.session_id] || 0) + Number(t.amount);
    });
    sessions.forEach((s) => {
      openCash += Number(s.opening_balance) + (bySession[s.id] || 0);
    });
  }

  // Ringkasan hutang (additive — graceful jika migration 0014 belum di-apply)
  let debt = { total_pending: 0, paid_today: 0, new_debt_today: 0, count_pending: 0 };
  try {
    const { data: debtSummary } = await supabase.rpc('fn_get_debt_summary', {
      p_from: today,
      p_to: today,
    });
    if (debtSummary) debt = debtSummary;
  } catch {
    // abaikan jika fn belum ada
  }

  return ok(res, {
    today_sales: todaySales,
    today_transactions: todayCount,
    today_refund: todayRefund,
    today_profit: Math.round(profit * 100) / 100,
    total_products: products.length,
    low_stock: lowStock,
    out_of_stock: outOfStock,
    total_customers: customersRes.count || 0,
    purchases_today: purchasesToday,
    open_cash: Math.round(openCash * 100) / 100,
    total_pending_debt: Number(debt.total_pending || 0),
    pending_debt_count: Number(debt.count_pending || 0),
    today_paid_debt: Number(debt.paid_today || 0),
    today_new_debt: Number(debt.new_debt_today || 0),
  });
});

// ============================================================
// DASHBOARD — grafik
// ============================================================
export const dashboardCharts = asyncHandler(async (req, res) => {
  const today = todayWib();
  const start7 = addDays(today, -6);
  const start30 = addDays(today, -29);
  const startIso7 = toIso(start7);
  const endIsoToday = toIso(today, true);
  const startIso30 = toIso(start30);

  // 1. Penjualan 7 hari
  const { data: sales7 } = await supabase
    .from('sales')
    .select('total, created_at, payment_method, status')
    .gte('created_at', startIso7)
    .lte('created_at', endIsoToday);
  const valid7 = (sales7 || []).filter((s) => s.status !== 'cancelled');

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(start7, i);
    days.push({ label: d, total: 0, transactions: 0 });
  }
  const salesByDay = {};
  valid7.forEach((s) => {
    const k = dayKey(s.created_at);
    if (!salesByDay[k]) salesByDay[k] = { total: 0, transactions: 0 };
    salesByDay[k].total += Number(s.total);
    salesByDay[k].transactions += 1;
  });
  days.forEach((d) => {
    if (salesByDay[d.label]) Object.assign(d, salesByDay[d.label]);
  });

  // 2. Ringkasan pembayaran (7 hari)
  const paymentMethods = {};
  valid7.forEach((s) => {
    paymentMethods[s.payment_method] = (paymentMethods[s.payment_method] || 0) + Number(s.total);
  });

  // 3. Top 10 produk (30 hari)
  const items = await fetchSaleItemsInRange(startIso30, endIsoToday);
  const byProduct = {};
  items.forEach((it) => {
    const key = it.products?.id || 'unknown';
    if (!byProduct[key]) byProduct[key] = { name: it.products?.name || 'Produk dihapus', quantity: 0 };
    byProduct[key].quantity += Number(it.quantity);
  });
  const topProducts = Object.values(byProduct).sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  // 4. Penjualan per kategori (30 hari)
  const byCategory = {};
  items.forEach((it) => {
    const name = it.products?.category?.name || 'Tanpa kategori';
    if (!byCategory[name]) byCategory[name] = 0;
    byCategory[name] += Number(it.subtotal || 0);
  });
  const categorySales = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return ok(res, { sales_7_days: days, payment_methods: paymentMethods, top_products: topProducts, category_sales: categorySales });
});
