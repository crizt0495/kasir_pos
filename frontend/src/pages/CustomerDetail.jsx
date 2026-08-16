import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, ReceiptText, Banknote } from 'lucide-react';
import { customersApi, salesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { Card, StatCard, Skeleton, ErrorState, EmptyState, StatusBadge, Pagination } from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime, paymentMethodLabel } from '../utils/format.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const customer = useApi(() => customersApi.get(id).then((r) => r.data), [id]);
  const transactions = useApi(() => salesApi.list({ customer_id: id, page, pageSize: 15 }).then((r) => r.data), [id, page]);

  const c = customer.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/customers')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Transaksi" value={c.total_transactions} icon={ReceiptText} color="bg-primary-50 text-primary-600" />
            <StatCard label="Total Belanja" value={formatRupiah(c.total_spend)} icon={Banknote} color="bg-emerald-50 text-emerald-600" />
            <StatCard label="Status" value={c.address ? 'Alamat tersimpan' : 'Tanpa alamat'} icon={Users} color="bg-slate-100 text-slate-600" />
          </div>

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
              <>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <th className="px-4 py-2.5 font-semibold">No. Transaksi</th>
                      <th className="px-4 py-2.5 font-semibold">Tanggal</th>
                      <th className="px-4 py-2.5 font-semibold">Metode</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.data.items.map((s) => (
                      <tr key={s.id} onClick={() => navigate(`/sales/${s.id}`)} className="cursor-pointer hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-medium text-primary-600">{s.invoice_number}</td>
                        <td className="px-4 py-2.5 text-slate-600">{formatDateTime(s.created_at)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{paymentMethodLabel(s.payment_method)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatRupiah(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-slate-200">
                  <Pagination
                    page={page}
                    totalPages={transactions.data.totalPages}
                    total={transactions.data.total}
                    pageSize={transactions.data.pageSize}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
