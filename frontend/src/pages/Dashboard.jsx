import { useApi } from '../hooks/useApi.js';
import { dashboardApi } from '../api/index.js';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Banknote, ReceiptText, Package, AlertTriangle, Users, ShoppingBag, TrendingUp, Wallet,
  HandCoins, BadgeDollarSign, History, RotateCcw,
} from 'lucide-react';
import { Card } from '../components/ui/DataTable.jsx';
import { StatCard, Skeleton, ErrorState, EmptyState, Badge } from '../components/ui/Feedback.jsx';
import { formatRupiah, formatNumber, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';

const CATEGORY_COLOR_MAP = {
  Sembako: '#2563eb',
  Minuman: '#f59e0b',
  Elektronik: '#dc2626',
  Makanan: '#16a34a',
  Snack: '#9333ea',
  'Kebutuhan Rumah': '#0d9488',
  Rokok: '#ea580c',
};
const PIE_FALLBACK_COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#dc2626', '#9333ea', '#0d9488', '#ea580c', '#db2777', '#ca8a04'];

function categoryColor(name, i) {
  return CATEGORY_COLOR_MAP[name] || PIE_FALLBACK_COLORS[i % PIE_FALLBACK_COLORS.length];
}

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
    <div className="rounded-lg border-2 border-black bg-white px-3.5 py-2.5 text-xs shadow-xl">
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

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + Number(p.value || 0), 0);
  return (
    <div className="rounded-lg border-2 border-black bg-white px-3.5 py-2.5 text-xs shadow-xl">
      {payload.map((p, i) => (
        <p key={i} className="font-medium text-slate-600">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: p.payload?.color || p.color || p.fill }} />
          {p.name}: {formatRupiah(p.value)}
          {total > 0 && <span className="text-slate-400"> ({((Number(p.value) / total) * 100).toFixed(1)}%)</span>}
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
            <StatCard
              label="Total Penjualan Hari Ini"
              value={formatRupiah(s.today_sales)}
              icon={Banknote}
              color="border-2 border-black bg-emerald-400 text-white shadow-[3px_3px_0_0_#0A0A0A]"
              sub={s.today_refund > 0 ? `Setelah retur ${formatRupiah(s.today_refund)}` : 'Setelah dikurangi retur'}
            />
            <StatCard label="Jumlah Transaksi Hari Ini" value={formatNumber(s.today_transactions)} icon={ReceiptText} color="border-2 border-black bg-primary-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard label="Profit Hari Ini" value={formatRupiah(s.today_profit)} icon={TrendingUp} color="border-2 border-black bg-sky-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard label="Total Produk" value={formatNumber(s.total_products)} icon={Package} color="border-2 border-black bg-slate-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard label="Stok Menipis" value={formatNumber(s.low_stock)} icon={AlertTriangle} color="border-2 border-black bg-amber-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" sub={s.out_of_stock > 0 ? `${formatNumber(s.out_of_stock)} produk habis` : null} />
            <StatCard label="Total Pelanggan" value={formatNumber(s.total_customers)} icon={Users} color="border-2 border-black bg-violet-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard label="Total Pembelian Hari Ini" value={formatRupiah(s.purchases_today)} icon={ShoppingBag} color="border-2 border-black bg-rose-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard label="Kas Saat Ini" value={formatRupiah(s.open_cash)} icon={Wallet} color="border-2 border-black bg-teal-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
          </div>

          {/* Ringkasan Hutang / Piutang — varian neo-brutalism (contoh) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              neo
              label="Total Piutang"
              value={formatRupiah(s.total_pending_debt)}
              icon={HandCoins}
              className="bg-yellow-300"
              sub={`${formatNumber(s.pending_debt_count)} transaksi belum lunas`}
            />
            <StatCard
              neo
              label="Piutang Bertambah Hari Ini"
              value={formatRupiah(s.today_new_debt)}
              icon={BadgeDollarSign}
              className="bg-orange-400"
            />
            <StatCard
              neo
              label="Pembayaran Piutang Hari Ini"
              value={formatRupiah(s.today_paid_debt)}
              icon={History}
              className="bg-lime-300"
            />
            <StatCard
              neo
              label="Uang Masuk Hari Ini"
              value={formatRupiah(
                Number(s.today_sales || 0) - Number(s.today_new_debt || 0) + Number(s.today_paid_debt || 0),
              )}
              icon={Banknote}
              className="bg-emerald-300"
              sub="Penjualan bersih + pembayaran piutang"
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
                  <LineChart data={charts.data.sales_7_days} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e4df" vertical={false} />
                    <XAxis dataKey="label" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#1f6f5c', strokeDasharray: '4 4' }} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Penjualan"
                      stroke="#1f6f5c"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#1f6f5c', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
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
                      data={charts.data.category_sales.map((d, i) => ({ ...d, color: categoryColor(d.name, i) }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      label={(e) => (e.percent > 0.05 ? e.name : '')}
                      labelLine={false}
                    >
                      {charts.data.category_sales.map((_, i) => (
                        <Cell key={i} fill={categoryColor(charts.data.category_sales[i].name, i)} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
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
                    <div key={method} className="flex items-center justify-between rounded-lg border-2 border-black px-3 py-2.5 transition-colors hover:bg-slate-50/60 hover:border-black">
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
