import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, ReceiptText, Banknote, Wallet } from 'lucide-react';
import { customersApi, salesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { DataTable, Card } from '../components/ui/DataTable.jsx';
import { StatCard, StatusBadge, Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { formatRupiah, formatDateTime, paymentMethodLabel } from '../utils/format.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const customer = useApi(() => customersApi.get(id).then((r) => r.data), [id]);
  const transactions = useApi(() => salesApi.list({ customer_id: id, page, pageSize: 15 }).then((r) => r.data), [id, page]);

  const c = customer.data;
  const stats = c?.debt_stats || {};
  const hadDebt = Number(c?.total_debt || 0) > 0 || Number(stats?.total_debt || 0) > 0;
  const pendingDebt = Number(stats?.pending_debt ?? c?.pending_debt ?? 0);
  const totalDebt = Number(stats?.total_debt ?? c?.total_debt ?? 0);
  const overdue = Number(stats?.overdue_debt || 0);
  const overdueCount = Number(stats?.overdue_count || 0);
  const dueSoon = Number(stats?.due_soon_records || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/customers')} className="rounded-md border-2 border-black bg-white p-2 text-slate-500 shadow-[2px_2px_0_0_#0A0A0A] hover:bg-slate-50 transition-all duration-100">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{c?.name || 'Detail Pelanggan'}</h1>
          <p className="text-sm text-slate-500">{c?.phone || '-'} · {c?.email || '-'}</p>
        </div>
      </div>

      {customer.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : customer.error ? (
        <ErrorState onRetry={customer.reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Transaksi" value={c.total_transactions} icon={ReceiptText} color="border-2 border-black bg-primary-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard label="Total Belanja" value={formatRupiah(c.total_spend)} icon={Banknote} color="border-2 border-black bg-emerald-400 text-white shadow-[3px_3px_0_0_#0A0A0A]" />
            <StatCard
              label="Total Hutang"
              value={formatRupiah(totalDebt)}
              icon={Wallet}
              color={totalDebt > 0 ? 'border-2 border-black bg-danger-400 text-white shadow-[3px_3px_0_0_#0A0A0A]' : 'border-2 border-black bg-slate-400 text-white shadow-[3px_3px_0_0_#0A0A0A]'}
            />
            <StatCard
              label="Piutang (Sisa)"
              value={formatRupiah(pendingDebt)}
              icon={Users}
              color={pendingDebt > 0 ? 'border-2 border-black bg-rose-500 text-white shadow-[3px_3px_0_0_#0A0A0A]' : 'border-2 border-black bg-slate-400 text-white shadow-[3px_3px_0_0_#0A0A0A]'}
            />
          </div>

          {hadDebt && (
            <div className="rounded-lg border-2 border-black bg-rose-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-rose-900">Ringkasan Hutang</h3>
                <Link to="/debts" className="text-xs font-medium text-rose-600 hover:underline">Kelola Hutang →</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                <SummaryBox label="Total Hutang" value={formatRupiah(totalDebt)} />
                <SummaryBox label="Piutang Aktif" value={formatRupiah(pendingDebt)} intent={pendingDebt > 0 ? 'danger' : 'success'} />
                <SummaryBox
                  label="Jatuh Tempo"
                  value={overdue > 0 || overdueCount > 0 ? `${overdueCount} catatan · ${formatRupiah(overdue)}` : '-'}
                  intent={overdueCount > 0 || overdue > 0 ? 'danger' : 'default'}
                />
                <SummaryBox
                  label="Segera Jatuh Tempo"
                  value={dueSoon > 0 ? `${dueSoon} catatan` : '-'}
                  intent={dueSoon > 0 ? 'warning' : 'default'}
                />
              </div>
            </div>
          )}

          <Card title="Informasi" bodyClassName="p-5">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p><span className="text-slate-400">Alamat:</span> {c.address || '-'}</p>
              <p><span className="text-slate-400">Tanggal Lahir:</span> {c.birth_date || '-'}</p>
              <p className="md:col-span-2"><span className="text-slate-400">Catatan:</span> {c.notes || '-'}</p>
            </div>
          </Card>

          <Card title="Riwayat Transaksi" bodyClassName="p-0">
            {transactions.loading ? (
              <div className="p-4"><Skeleton className="h-10 w-full" /></div>
            ) : transactions.error ? (
              <ErrorState onRetry={transactions.reload} />
            ) : !transactions.data?.items?.length ? (
              <EmptyState title="Belum ada transaksi" />
            ) : (
              <DataTable
                columns={[
                  { key: 'invoice_number', headerLabel: 'No. Transaksi' },
                  { key: 'created_at', headerLabel: 'Tanggal' },
                  { key: 'payment_method', headerLabel: 'Metode', render: (row) => paymentMethodLabel(row.payment_method) },
                  { key: 'status', headerLabel: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  { key: 'total', headerLabel: 'Total', align: 'right' }
                ]}
                data={transactions.data.items}
                loading={transactions.loading}
                page={page}
                totalPages={transactions.data.totalPages}
                total={transactions.data.total}
                pageSize={transactions.data.pageSize}
                onPageChange={setPage}
                onRowClick={(sale) => navigate(`/sales/${sale.id}`)}
                className="w-full"
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryBox({ label, value, intent = 'default' }) {
  const tone = {
    danger: 'text-rose-600 bg-rose-100/70',
    success: 'text-emerald-600 bg-emerald-100/70',
    warning: 'text-amber-600 bg-amber-100/70',
    default: 'text-slate-700 bg-white',
  }[intent];
  return (
    <div className={`rounded-lg px-4 py-3 ${tone}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold">{value}</p>
    </div>
  );
}
