import { useState } from 'react';
import { FileDown, TrendingUp, FileSpreadsheet, FileText } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { reportsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { Tabs } from '../components/ui/DataTable.jsx';
import { Select } from '../components/ui/Form.jsx';
import { Card } from '../components/ui/DataTable.jsx';
import { Skeleton, ErrorState, EmptyState, Badge } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { DatePicker, DateRangePicker } from '../components/ui/DatePicker.jsx';
import { formatRupiah, formatNumber, formatDate, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';

const PERIODS = [
  { key: 'daily', label: 'Harian' },
  { key: 'weekly', label: 'Mingguan' },
  { key: 'monthly', label: 'Bulanan' },
  { key: 'custom', label: 'Custom' },
];

const TABS = [
  { key: 'sales', label: 'Penjualan' },
  { key: 'profit', label: 'Profit' },
  { key: 'products', label: 'Produk' },
  { key: 'inventory', label: 'Stok' },
  { key: 'cashier', label: 'Kasir' },
  { key: 'purchases', label: 'Pembelian' },
  { key: 'debts', label: 'Hutang / Piutang' },
];

const EXPORT_PATHS = {
  sales: '/reports/sales',
  profit: '/reports/profit',
  products: '/reports/products',
  inventory: '/reports/inventory',
  cashier: '/reports/cashier',
  purchases: '/reports/purchases',
  debts: '/reports/debts',
};

export default function Reports() {
  const { can } = usePermission();
  const [tab, setTab] = useState('sales');
  const [period, setPeriod] = useState('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState('');

  const params = { period: period === 'custom' ? 'custom' : period, ...(from && { from }), ...(to && { to }) };
  const deps = [tab, period, from, to];

  const data = useApi(
    () => reportsApi[tab](params).then((r) => r.data),
    deps
  );

  const d = data.data;
  const hasDateRange = ['sales', 'profit', 'debts'].includes(tab);
  const showDatePicker = hasDateRange ? period === 'custom' : true;

  const runExport = async (fmt, fn) => {
    if (exporting) return;
    setExporting(fmt);
    try {
      await fn();
      toast.success(`Laporan ${fmt.toUpperCase()} diunduh`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Gagal mengunduh ${fmt.toUpperCase()}`));
    } finally {
      setExporting('');
    }
  };

  const exportCsv = () => runExport('csv', () =>
    reportsApi.exportCsv(EXPORT_PATHS[tab], params, `laporan-${tab}-${from || 'semua'}-${to || 'semua'}.csv`)
  );
  const exportExcel = () => runExport('xlsx', () =>
    reportsApi.exportExcel(EXPORT_PATHS[tab], params, `laporan-${tab}-${from || 'semua'}-${to || 'semua'}.xlsx`)
  );
  const exportPdf = () => runExport('pdf', () =>
    reportsApi.exportPdf(EXPORT_PATHS[tab], params, `laporan-${tab}-${from || 'semua'}-${to || 'semua'}.pdf`)
  );

  const setPageDate = (setter) => (e) => {
    const v = e.target.value;
    setter(v);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan"
        description="Analisis penjualan, profit, produk, stok, kasir, dan pembelian"
        actions={can('reports.export') && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={FileText} onClick={exportPdf} loading={exporting === 'pdf'} disabled={!!exporting}>Export PDF</Button>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={exportExcel} loading={exporting === 'xlsx'} disabled={!!exporting}>Export Excel</Button>
            <Button variant="secondary" icon={FileDown} onClick={exportCsv} loading={exporting === 'csv'} disabled={!!exporting}>Export CSV</Button>
          </div>
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {['sales', 'profit'].includes(tab) && (
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-36">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
        )}
      </div>

      {showDatePicker && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <DateRangePicker
            from={from}
            to={to}
            onFromChange={setPageDate(setFrom)}
            onToChange={setPageDate(setTo)}
            hint={hasDateRange ? 'Rentang tanggal untuk Custom' : 'Filter laporan berdasarkan rentang tanggal'}
          />
        </div>
      )}

      {data.loading ? (
        <Skeleton className="h-96 w-full" />
      ) : data.error ? (
        <ErrorState onRetry={data.reload} />
      ) : !d ? null : (
        <div className="space-y-4">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tab === 'sales' && (
              <>
                <SummaryCard label="Total Penjualan" value={formatRupiah(d.totals?.sales)} />
                <SummaryCard label="Jumlah Transaksi" value={formatNumber(d.totals?.transactions)} />
                <SummaryCard label="Diskon" value={formatRupiah(d.totals?.discount)} />
                <SummaryCard label="Pajak" value={formatRupiah(d.totals?.tax)} />
                <SummaryCard label="Retur" value={formatRupiah(d.totals?.refunds)} />
                <SummaryCard label="Net Penjualan" value={formatRupiah(d.totals?.net)} highlight />
              </>
            )}
            {tab === 'profit' && (
              <>
                <SummaryCard label="Total Pendapatan" value={formatRupiah(d.totals?.revenue)} />
                <SummaryCard label="Jumlah Transaksi" value={formatNumber(d.totals?.transactions)} />
                <SummaryCard label="HPP (COGS)" value={formatRupiah(d.totals?.cogs)} />
                <SummaryCard label="Profit" value={formatRupiah(d.totals?.profit)} highlight />
              </>
            )}
            {tab === 'products' && (
              <>
                <SummaryCard label="Total Produk Dijual" value={formatNumber(d.total_products_sold)} />
                <SummaryCard label="Produk Terlaris" value={d.top?.[0]?.name || '-'} />
                <SummaryCard label="Periode" value={`${d.from} → ${d.to}`} />
              </>
            )}
            {tab === 'inventory' && (
              <>
                <SummaryCard label="Total Produk" value={formatNumber(d.totals?.total_products)} />
                <SummaryCard label="Stok Tersedia" value={formatNumber(d.totals?.available)} />
                <SummaryCard label="Stok Menipis" value={formatNumber(d.totals?.low_stock)} />
                <SummaryCard label="Stok Habis" value={formatNumber(d.totals?.out_of_stock)} />
              </>
            )}
            {tab === 'cashier' && (
              <>
                <SummaryCard label="Total Kasir Aktif" value={formatNumber(d.cashiers?.length)} />
                <SummaryCard label="Total Transaksi" value={formatNumber(d.cashiers?.reduce((a, c) => a + c.transactions, 0))} />
                <SummaryCard label="Total Pendapatan" value={formatRupiah(d.cashiers?.reduce((a, c) => a + c.total, 0))} highlight />
              </>
            )}
            {tab === 'purchases' && (
              <>
                <SummaryCard label="Jumlah Pembelian" value={formatNumber(d.totals?.count)} />
                <SummaryCard label="Total Pengeluaran" value={formatRupiah(d.totals?.total)} highlight />
                <SummaryCard label="Supplier Terlibat" value={formatNumber(d.suppliers?.length)} />
                <SummaryCard label="Periode" value={`${d.from} → ${d.to}`} />
              </>
            )}
            {tab === 'debts' && (
              <>
                <SummaryCard label="Total Piutang" value={formatRupiah(d.totals?.total_debt)} highlight />
                <SummaryCard label="Sudah Dibayar" value={formatRupiah(d.totals?.total_paid)} />
                <SummaryCard label="Sisa Belum Bayar" value={formatRupiah(d.totals?.total_pending)} />
                <SummaryCard label="Jatuh Tempo" value={formatRupiah(d.totals?.total_overdue)} />
                <SummaryCard label="Pelanggan Berhutang" value={formatNumber(d.totals?.customers_count)} />
                <SummaryCard label="Catatan Hutang" value={formatNumber(d.totals?.records_count)} />
                <SummaryCard label="Belum Lunas" value={formatNumber(d.totals?.pending_count)} />
                <SummaryCard label="Periode" value={`${d.from} → ${d.to}`} />
              </>
            )}
          </div>

          {/* Grafik utk penjualan & profit */}
          {(tab === 'sales' || tab === 'profit') && (
            <Card title={tab === 'sales' ? 'Grafik Penjualan Harian' : 'Grafik Revenue vs Profit'} bodyClassName="p-4">
              {d.buckets?.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={d.buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e4df" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatRupiah(v)} />
                    <Legend />
                    {tab === 'sales' ? (
                      <>
                        <Bar dataKey="sales" name="Penjualan" fill="#1f6f5c" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="refunds" name="Retur" fill="#b23a48" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="revenue" name="Pendapatan" fill="#1f6f5c" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="profit" name="Profit" fill="#369469" radius={[4, 4, 0, 0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Belum ada data" />
              )}
            </Card>
          )}

          {/* Tabel detail */}
          <Card bodyClassName="p-0">
            {tab === 'sales' && <SalesTable d={d} />}
            {tab === 'profit' && <ProfitTable d={d} />}
            {tab === 'products' && <ProductsTable d={d} />}
            {tab === 'inventory' && <InventoryTable d={d} />}
            {tab === 'cashier' && <CashierTable d={d} />}
            {tab === 'purchases' && <PurchasesTable d={d} />}
            {tab === 'debts' && <DebtsTable d={d} />}
          </Card>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight = false }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlight ? 'border-primary-200 bg-primary-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${highlight ? 'text-primary-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function SalesTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      {(!d.buckets || d.buckets.length === 0) && <EmptyState title="Belum ada data" />}
      <div className="hidden border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:flex sm:justify-between">
        <span className="w-32">Tanggal</span>
        <div className="flex gap-6">
          <span className="w-16 text-right">Transaksi</span>
          <span className="w-28 text-right">Penjualan</span>
          <span className="w-24 text-right">Diskon</span>
          <span className="w-20 text-right">Pajak</span>
          <span className="w-24 text-right">Retur</span>
          <span className="w-28 text-right">Net</span>
        </div>
      </div>
      {d.buckets?.map((b) => (
        <div key={b.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="w-32 font-medium text-slate-700">{formatDate(b.label)}</span>
          <div className="flex gap-6">
            <span className="w-16 text-right text-slate-500">{formatNumber(b.transactions)}</span>
            <span className="w-28 text-right font-semibold">{formatRupiah(b.sales)}</span>
            <span className="w-24 text-right text-amber-600">{formatRupiah(b.discount)}</span>
            <span className="w-20 text-right text-slate-500">{formatRupiah(b.tax)}</span>
            <span className="w-24 text-right text-red-500">-{formatRupiah(b.refunds)}</span>
            <span className="w-28 text-right font-bold text-primary-700">{formatRupiah(b.sales - b.refunds)}</span>
          </div>
        </div>
      ))}
      {d.payment_methods && Object.keys(d.payment_methods).length > 0 && (
        <div className="bg-slate-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Rincian Metode Pembayaran</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.payment_methods).map(([m, total]) => (
              <span key={m} className={`rounded-full px-2.5 py-1 text-xs font-medium ${paymentMethodColor(m)}`}>
                {paymentMethodLabel(m)}: {formatRupiah(total)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfitTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      {(!d.buckets || d.buckets.length === 0) && <EmptyState title="Belum ada data" />}
      <div className="hidden border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:flex sm:justify-between">
        <span className="w-32">Tanggal</span>
        <div className="flex gap-6">
          <span className="w-16 text-right">Transaksi</span>
          <span className="w-28 text-right">Revenue</span>
          <span className="w-28 text-right">HPP</span>
          <span className="w-28 text-right">Profit</span>
        </div>
      </div>
      {d.buckets?.map((b) => (
        <div key={b.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="w-32 font-medium text-slate-700">{formatDate(b.label)}</span>
          <div className="flex gap-6">
            <span className="w-16 text-right text-slate-500">{formatNumber(b.transactions)}</span>
            <span className="w-28 text-right">{formatRupiah(b.revenue)}</span>
            <span className="w-28 text-right text-slate-500">{formatRupiah(b.cogs)}</span>
            <span className="w-28 text-right font-bold text-emerald-600">{formatRupiah(b.profit)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductsTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      <p className="px-4 py-2 text-xs font-semibold uppercase text-slate-400">Produk Terlaris</p>
      {d.top?.length === 0 && <EmptyState title="Belum ada data" />}
      {d.top?.map((p, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <Badge color="bg-primary-100 text-primary-700">{i + 1}</Badge>
            <span className="font-medium text-slate-700">{p.name}</span>
            <span className="text-xs text-slate-400">{p.sku}</span>
          </div>
          <div className="flex gap-6">
            <span className="w-24 text-right">{formatNumber(p.quantity)} terjual</span>
            <span className="w-28 text-right font-semibold">{formatRupiah(p.revenue)}</span>
          </div>
        </div>
      ))}
      <p className="border-t border-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-400">Paling Sedikit Terjual</p>
      {d.least?.map((p, i) => (
        <div key={`l${i}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <Badge color="bg-slate-100 text-slate-600">{i + 1}</Badge>
            <span className="font-medium text-slate-700">{p.name}</span>
            <span className="text-xs text-slate-400">{p.sku}</span>
          </div>
          <div className="flex gap-6">
            <span className="w-24 text-right">{formatNumber(p.quantity)} terjual</span>
            <span className="w-28 text-right font-semibold">{formatRupiah(p.revenue)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function InventoryTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      <p className="px-4 py-2 text-xs font-semibold uppercase text-slate-400">Pergerakan Stok ({d.from} → {d.to})</p>
      {d.movements?.length === 0 && <EmptyState title="Belum ada data pergerakan stok" />}
      {d.movements?.map((m) => (
        <div key={m.type} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">{m.type}</span>
          <div className="flex gap-6">
            <span className="w-20 text-right text-emerald-600">+{formatNumber(m.in)}</span>
            <span className="w-20 text-right text-red-600">-{formatNumber(m.out)}</span>
            <span className="w-20 text-right text-slate-400">{m.count} transaksi</span>
          </div>
        </div>
      ))}

      {d.low_stock_list?.length > 0 && (
        <>
          <p className="border-t border-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-400">Stok Menipis ({d.low_stock_list.length} produk)</p>
          {d.low_stock_list.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-400">{p.sku}</span>
              </div>
              <span className="text-amber-600">stok {formatNumber(p.stock)} / min {formatNumber(p.min_stock)}</span>
            </div>
          ))}
        </>
      )}

      {d.out_of_stock_list?.length > 0 && (
        <>
          <p className="border-t border-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-400">Stok Habis ({d.out_of_stock_list.length} produk)</p>
          {d.out_of_stock_list.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-400">{p.sku}</span>
              </div>
              <Badge color="bg-red-100 text-red-700">Habis</Badge>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function CashierTable({ d }) {
  const getName = (v) => (typeof v === 'string' ? v : v?.full_name || v?.name || '');
  return (
    <div className="divide-y divide-slate-100">
      {!d.cashiers?.length && <EmptyState title="Belum ada data" />}
      {d.cashiers?.map((c) => (
        <div key={c.cashier_id} className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-700">{getName(c.full_name) || c.username}</p>
              {getName(c.full_name) && <p className="text-xs text-slate-400">@{c.username}</p>}
              <p className="text-xs text-slate-400">{formatNumber(c.transactions)} transaksi</p>
            </div>
            <span className="font-semibold">{formatRupiah(c.total)}</span>
          </div>
          {c.payment_methods && Object.keys(c.payment_methods).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(c.payment_methods).map(([m, total]) => (
                <span key={m} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${paymentMethodColor(m)}`}>
                  {paymentMethodLabel(m)}: {formatRupiah(total)}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PurchasesTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      {!d.suppliers?.length && <EmptyState title="Belum ada data" />}
      {d.suppliers?.map((s) => (
        <div key={s.supplier} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">{s.supplier}</span>
          <div className="flex gap-6">
            <span className="w-24 text-right text-slate-500">{formatNumber(s.count)} pembelian</span>
            <span className="w-28 text-right font-semibold">{formatRupiah(s.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const DEBT_REPORT_COLORS = {
  pending: 'bg-warning-100 text-warning-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-success-100 text-success-700',
  overdue: 'bg-danger-100 text-danger-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const DEBT_REPORT_LABELS = {
  pending: 'Belum Bayar',
  partial: 'Sebagian',
  paid: 'Lunas',
  overdue: 'Jatuh Tempo',
  cancelled: 'Dibatalkan',
};

function DebtsTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      {!d.debts?.length && <EmptyState title="Belum ada data hutang" />}
      {d.debts?.map((debt) => (
        <div key={debt.id} className="px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{debt.customer?.name || '-'}</p>
              <p className="text-xs text-slate-400">
                {formatDate(debt.created_at)} · {debt.customer?.phone || '-'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-400">Total</p>
                <p className="font-mono">{formatRupiah(debt.amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Dibayar</p>
                <p className="font-mono text-emerald-600">{formatRupiah(debt.paid_amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Sisa</p>
                <p className={`font-mono font-semibold ${Math.max(0, Number(debt.remaining_amount)) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {formatRupiah(debt.remaining_amount)}
                </p>
              </div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DEBT_REPORT_COLORS[debt.status] || 'bg-slate-100'}`}>
                {DEBT_REPORT_LABELS[debt.status] || debt.status}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
