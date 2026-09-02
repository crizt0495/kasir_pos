import { useApi } from '../hooks/useApi.js';
import { dashboardApi } from '../api/index.js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Banknote, ReceiptText, Package, AlertTriangle, Users, ShoppingBag, TrendingUp, Wallet,
  HandCoins, BadgeDollarSign, History,
} from 'lucide-react';
import { Card } from '../components/ui/DataTable.jsx';
import { StatCard, Skeleton, ErrorState, EmptyState, Badge } from '../components/ui/Feedback.jsx';
import { formatRupiah, formatNumber, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';

const PIE_COLORS = ['#1f6f5c', '#369469', '#b9793a', '#2e7c7a', '#b23a48', '#7f5589', '#3a8f84', '#6e6d74'];

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
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs shadow-xl shadow-slate-900/10">
      {label && <p className="mb-1.5 font-semibold text-slate-800">{label}</p>}
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
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Penjualan Hari Ini" value={formatRupiah(s.today_sales)} icon={Banknote} color="bg-emerald-500 text-white" />
            <StatCard label="Jumlah Transaksi Hari Ini" value={formatNumber(s.today_transactions)} icon={ReceiptText} color="bg-primary-500 text-white" />
            <StatCard label="Profit Hari Ini" value={formatRupiah(s.today_profit)} icon={TrendingUp} color="bg-sky-500 text-white" />
            <StatCard label="Total Produk" value={formatNumber(s.total_products)} icon={Package} color="bg-slate-500 text-white" />
            <StatCard label="Stok Menipis" value={formatNumber(s.low_stock)} icon={AlertTriangle} color="bg-amber-500 text-white" />
            <StatCard label="Total Pelanggan" value={formatNumber(s.total_customers)} icon={Users} color="bg-violet-500 text-white" />
            <StatCard label="Total Pembelian Hari Ini" value={formatRupiah(s.purchases_today)} icon={ShoppingBag} color="bg-rose-500 text-white" />
            <StatCard label="Kas Saat Ini" value={formatRupiah(s.open_cash)} icon={Wallet} color="bg-teal-500 text-white" />
          </div>

          {/* Ringkasan Hutang / Piutang (additive — memakai data dari summary) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Piutang"
              value={formatRupiah(s.total_pending_debt)}
              icon={HandCoins}
              color="bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/25"
              sub={`${formatNumber(s.pending_debt_count)} transaksi belum lunas`}
            />
            <StatCard
              label="Piutang Bertambah Hari Ini"
              value={formatRupiah(s.today_new_debt)}
              icon={BadgeDollarSign}
              color="bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/25"
            />
            <StatCard
              label="Pembayaran Piutang Hari Ini"
              value={formatRupiah(s.today_paid_debt)}
              icon={History}
              color="bg-gradient-to-br from-success-400 to-success-600 text-white shadow-md shadow-success-500/25"
            />
            <StatCard
              label="Uang Masuk (Hari Ini)"
              value={formatRupiah(Number(s.today_sales) - Number(s.today_new_debt))}
              icon={Banknote}
              color="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/25"
              sub="Penjualan dikurangi piutang baru"
            />
          </div>
        </>
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
                        <stop offset="0%" stopColor="#1f6f5c" />
                        <stop offset="100%" stopColor="#164f41" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e4df" vertical={false} />
                    <XAxis dataKey="label" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(31 111 92 / 0.06)' }} />
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
                <ul className="divide-y divide-slate-100/80">
                  {charts.data.top_products.map((p, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-slate-50/60">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            i === 0
                              ? 'bg-amber-500 text-white'
                              : i === 1
                              ? 'bg-slate-400 text-white'
                              : i === 2
                              ? 'bg-orange-400 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{p.name}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-500">{formatNumber(p.quantity)} terjual</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Belum ada data" />
              )}
            </Card>

            <Card title="Ringkasan Pembayaran Hari Ini" bodyClassName="p-4">
              {Object.keys(charts.data.payment_methods).length ? (
                <div className="space-y-2">
                  {Object.entries(charts.data.payment_methods).map(([method, total]) => (
                    <div key={method} className="flex items-center justify-between rounded-xl border border-slate-100/80 px-3 py-2.5 transition-colors hover:bg-slate-50/60 hover:border-slate-200/80">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentMethodColor(method)}`}>
                        {paymentMethodLabel(method)}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{formatRupiah(total)}</span>
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
