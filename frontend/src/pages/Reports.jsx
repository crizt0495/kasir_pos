import { useState } from 'react';
import { FileDown, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { reportsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Card, Tabs, Button, Select, Field, Input, Skeleton, ErrorState, EmptyState, Badge } from '../components/ui/index.jsx';
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
];

const EXPORT_PATHS = {
  sales: '/reports/sales',
  profit: '/reports/profit',
  products: '/reports/products',
  inventory: '/reports/inventory',
  cashier: '/reports/cashier',
  purchases: '/reports/purchases',
};

export default function Reports() {
  const { can } = usePermission();
  const [tab, setTab] = useState('sales');
  const [period, setPeriod] = useState('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = { period: period === 'custom' ? 'custom' : period, ...(from && { from }), ...(to && { to }) };
  const deps = [tab, period, from, to];

  const data = useApi(
    () => reportsApi[tab](params).then((r) => r.data),
    deps
  );

  const d = data.data;

  const exportCsv = async () => {
    try {
      await reportsApi.exportCsv(EXPORT_PATHS[tab], params, `laporan-${tab}-${from || 'semua'}-${to || 'semua'}.csv`);
      toast.success('Laporan CSV diunduh');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal mengunduh CSV'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Laporan</h1>
          <p className="text-sm text-slate-500">Analisis penjualan, profit, produk, stok, kasir, dan pembelian</p>
        </div>
        {can('reports.export') && (
          <Button variant="secondary" icon={FileDown} onClick={exportCsv}>
            Export CSV
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {['sales', 'profit'].includes(tab) && (
          <div className="flex items-center gap-2">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-36">
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
            {period === 'custom' && (
              <>
                <Field className="w-36"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field className="w-36"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              </>
            )}
          </div>
        )}
      </div>

      {data.loading ? (
        <Skeleton className="h-96 w-full" />
      ) : data.error ? (
        <ErrorState onRetry={data.reload} />
      ) : !d ? null : (
        <div className="space-y-4">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(tab === 'sales' || tab === 'profit') && (
              <>
                <SummaryCard label="Total Penjualan" value={formatRupiah(d.totals?.sales ?? d.totals?.revenue)} />
                <SummaryCard label="Jumlah Transaksi" value={formatNumber(d.totals?.transactions)} />
                {tab === 'sales' ? (
                  <SummaryCard label="Retur" value={formatRupiah(d.totals?.refunds)} />
                ) : (
                  <SummaryCard label="HPP" value={formatRupiah(d.totals?.cogs)} />
                )}
                <SummaryCard label={tab === 'profit' ? 'Profit' : 'Net'} value={formatRupiah(tab === 'profit' ? d.totals?.profit : d.totals?.net)} highlight />
              </>
            )}
            {tab === 'products' && (
              <>
                <SummaryCard label="Produk Terjual" value={formatNumber(d.total_products_sold)} />
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
            {tab === 'purchases' && (
              <>
                <SummaryCard label="Jumlah Pembelian" value={formatNumber(d.totals?.count)} />
                <SummaryCard label="Total Pembelian" value={formatRupiah(d.totals?.total)} />
                <SummaryCard label="Periode" value={`${d.from} → ${d.to}`} />
              </>
            )}
            {tab === 'cashier' && (
              <SummaryCard label="Kasir" value={formatNumber(d.cashiers?.length)} />
            )}
          </div>

          {/* Grafik utk penjualan & profit */}
          {(tab === 'sales' || tab === 'profit') && (
            <Card title={tab === 'sales' ? 'Grafik Penjualan' : 'Grafik Revenue vs Profit'} bodyClassName="p-4">
              {d.buckets?.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={d.buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatRupiah(v)} />
                    <Legend />
                    {tab === 'sales' ? (
                      <Bar dataKey="sales" name="Penjualan" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    ) : (
                      <>
                        <Bar dataKey="revenue" name="Pendapatan" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
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
      <p className={`mt-1 text-lg font-bold ${highlight ? 'text-primary-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function SalesTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      {(!d.buckets || d.buckets.length === 0) && <EmptyState title="Belum ada data" />}
      {d.buckets?.map((b) => (
        <div key={b.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">{formatDate(b.label)}</span>
          <div className="flex gap-6">
            <span className="text-slate-500">{formatNumber(b.transactions)} transaksi</span>
            <span className="w-28 text-right font-semibold">{formatRupiah(b.sales)}</span>
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
      {d.buckets?.map((b) => (
        <div key={b.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">{formatDate(b.label)}</span>
          <div className="flex gap-6">
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
          <span className="w-24 text-right">{formatNumber(p.quantity)} terjual</span>
        </div>
      ))}
    </div>
  );
}

function InventoryTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      <p className="px-4 py-2 text-xs font-semibold uppercase text-slate-400">Pergerakan Stok ({d.from} → {d.to})</p>
      {d.movements?.length === 0 && <EmptyState title="Belum ada data" />}
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
          <p className="border-t border-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-400">Stok Menipis</p>
          {d.low_stock_list.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium text-slate-700">{p.name}</span>
              <span className="text-amber-600">stok {formatNumber(p.stock)} / min {formatNumber(p.min_stock)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function CashierTable({ d }) {
  return (
    <div className="divide-y divide-slate-100">
      {!d.cashiers?.length && <EmptyState title="Belum ada data" />}
      {d.cashiers?.map((c) => (
        <div key={c.cashier_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <div>
            <p className="font-medium text-slate-700">{c.full_name || c.username}</p>
            <p className="text-xs text-slate-400">{formatNumber(c.transactions)} transaksi</p>
          </div>
          <span className="font-semibold">{formatRupiah(c.total)}</span>
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
