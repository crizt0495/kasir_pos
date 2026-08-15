import { useApi } from '../hooks/useApi.js';
import { dashboardApi } from '../api/index.js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Banknote, ReceiptText, Package, AlertTriangle, Users, ShoppingBag, TrendingUp, Wallet,
} from 'lucide-react';
import { StatCard, Card, Skeleton, ErrorState, EmptyState } from '../components/ui/index.jsx';
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

export default function Dashboard() {
  const summary = useApi(() => dashboardApi.summary().then((r) => r.data));
  const charts = useApi(() => dashboardApi.charts().then((r) => r.data));

  const s = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Ringkasan performa toko hari ini</p>
      </div>

      {summary.loading ? (
        <SummarySkeleton />
      ) : summary.error ? (
        <ErrorState onRetry={summary.reload} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Penjualan Hari Ini" value={formatRupiah(s.today_sales)} icon={Banknote} color="bg-emerald-50 text-emerald-600" />
          <StatCard label="Jumlah Transaksi Hari Ini" value={formatNumber(s.today_transactions)} icon={ReceiptText} color="bg-indigo-50 text-indigo-600" />
          <StatCard label="Profit Hari Ini" value={formatRupiah(s.today_profit)} icon={TrendingUp} color="bg-sky-50 text-sky-600" />
          <StatCard label="Total Produk" value={formatNumber(s.total_products)} icon={Package} color="bg-slate-100 text-slate-600" />
          <StatCard label="Stok Menipis" value={formatNumber(s.low_stock)} icon={AlertTriangle} color="bg-amber-50 text-amber-600" />
          <StatCard label="Total Pelanggan" value={formatNumber(s.total_customers)} icon={Users} color="bg-violet-50 text-violet-600" />
          <StatCard label="Total Pembelian Hari Ini" value={formatRupiah(s.purchases_today)} icon={ShoppingBag} color="bg-rose-50 text-rose-600" />
          <StatCard label="Kas Saat Ini" value={formatRupiah(s.open_cash)} icon={Wallet} color="bg-emerald-50 text-emerald-600" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatRupiah(v)} />
                    <Bar dataKey="total" name="Penjualan" fill="#4f46e5" radius={[4, 4, 0, 0]} />
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
                    <Tooltip formatter={(v) => formatRupiah(v)} />
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
                    <li key={i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
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
                <div className="space-y-3">
                  {Object.entries(charts.data.payment_methods).map(([method, total]) => (
                    <div key={method} className="flex items-center justify-between">
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
