import { useApi } from '../hooks/useApi.js';
import { dashboardApi } from '../api/index.js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Banknote, ReceiptText, Package, AlertTriangle, Users, ShoppingBag, TrendingUp, Wallet,
} from 'lucide-react';
import { StatCard, Card, Skeleton, ErrorState, EmptyState, Badge } from '../components/ui/index.jsx';
import { formatRupiah, formatNumber, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';

const PIE_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#14b8a6', '#f97316'];

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-semibold text-slate-700">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-medium text-slate-600">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: {formatRupiah(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const summary = useApi(() => dashboardApi.summary().then((r) => r.data));
  const charts = useApi(() => dashboardApi.charts().then((r) => r.data));

  const s = summary.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Ringkasan performa toko hari ini</p>
        </div>
        <Badge variant="primary" dot className="shadow-sm">
          Live · {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Badge>
      </div>

      {summary.loading ? (
        <SummarySkeleton />
      ) : summary.error ? (
        <ErrorState onRetry={summary.reload} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Penjualan Hari Ini" value={formatRupiah(s.today_sales)} icon={Banknote} color="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/25" />
          <StatCard label="Jumlah Transaksi Hari Ini" value={formatNumber(s.today_transactions)} icon={ReceiptText} color="bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-md shadow-primary-500/25" />
          <StatCard label="Profit Hari Ini" value={formatRupiah(s.today_profit)} icon={TrendingUp} color="bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-md shadow-sky-500/25" />
          <StatCard label="Total Produk" value={formatNumber(s.total_products)} icon={Package} color="bg-gradient-to-br from-slate-400 to-slate-600 text-white shadow-md shadow-slate-500/25" />
          <StatCard label="Stok Menipis" value={formatNumber(s.low_stock)} icon={AlertTriangle} color="bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/25" />
          <StatCard label="Total Pelanggan" value={formatNumber(s.total_customers)} icon={Users} color="bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-md shadow-violet-500/25" />
          <StatCard label="Total Pembelian Hari Ini" value={formatRupiah(s.purchases_today)} icon={ShoppingBag} color="bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-md shadow-rose-500/25" />
          <StatCard label="Kas Saat Ini" value={formatRupiah(s.open_cash)} icon={Wallet} color="bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-md shadow-teal-500/25" />
        </div>
      )}

      {charts.loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : charts.error ? (
        <ErrorState onRetry={charts.reload} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Penjualan 7 Hari Terakhir" bodyClassName="p-4">
              {charts.data.sales_7_days.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={charts.data.sales_7_days} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#4f46e5" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(99 102 241 / 0.06)' }} />
                    <Bar dataKey="total" name="Penjualan" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Belum ada penjualan" />
              )}
            </Card>

            <Card title="Penjualan per Kategori (30 hari)" bodyClassName="p-4">
              {charts.data.category_sales.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={charts.data.category_sales}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      label={(e) => (e.percent > 0.05 ? e.name : '')}
                      labelLine={false}
                    >
                      {charts.data.category_sales.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Belum ada data" />
              )}
            </Card>

            <Card title="Produk Terlaris (30 hari)" bodyClassName="p-0">
              {charts.data.top_products.length ? (
                <ul className="divide-y divide-slate-100">
                  {charts.data.top_products.map((p, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-slate-50/70">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            i === 0
                              ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm shadow-amber-400/40'
                              : i === 1
                              ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                              : i === 2
                              ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="text-sm text-slate-700">{p.name}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-500">{formatNumber(p.quantity)} terjual</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Belum ada data" />
              )}
            </Card>

            <Card title="Ringkasan Pembayaran Hari Ini" bodyClassName="p-4">
              {Object.keys(charts.data.payment_methods).length ? (
                <div className="space-y-2.5">
                  {Object.entries(charts.data.payment_methods).map(([method, total]) => (
                    <div key={method} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50/70">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${paymentMethodColor(method)}`}>
                        {paymentMethodLabel(method)}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{formatRupiah(total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Belum ada pembayaran hari ini" />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
