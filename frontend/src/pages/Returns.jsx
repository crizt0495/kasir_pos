import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, RotateCcw } from 'lucide-react';
import { returnsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { DataTable, SearchInput, StatusBadge, PageHeader } from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime, paymentMethodLabel } from '../utils/format.js';

export default function Returns() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const list = useApi(
    () => returnsApi.list({ search: debounced || undefined, from: from || undefined, to: to || undefined, page, pageSize }).then((r) => r.data),
    [debounced, from, to, page, pageSize]
  );

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Retur" description="Riwayat retur penjualan" />

      <DataTable
        columns={[
          { key: 'return_number', header: 'No. Retur', render: (r) => (
            <span className="flex items-center gap-1.5 font-medium text-red-600">
              <RotateCcw className="h-3.5 w-3.5" /> {r.return_number}
            </span>
          )},
          { key: 'sale', header: 'No. Penjualan', render: (r) => <span className="text-primary-600">{r.sale?.invoice_number || '-'}</span> },
          { key: 'customer', header: 'Pelanggan', render: (r) => r.customer?.name || '-' },
          { key: 'total_refund', header: 'Refund', render: (r) => <span className="font-semibold text-red-600">-{formatRupiah(r.total_refund)}</span> },
          { key: 'reason', header: 'Alasan', render: (r) => <span className="line-clamp-1 max-w-48">{r.reason || '-'}</span> },
          { key: 'created_at', header: 'Tanggal', render: (r) => formatDateTime(r.created_at) },
          { key: 'created_by_user', header: 'Oleh', render: (r) => r.created_by_user?.profiles?.full_name || r.created_by_user?.username || '-' },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <button onClick={() => navigate(`/sales/${r.sale_id}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600">
              <Eye className="h-4 w-4" />
            </button>
          )},
        ]}
        data={d?.items || []}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        totalPages={d?.totalPages}
        total={d?.total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        renderCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="flex items-center gap-1.5 font-medium text-red-600">
                  <RotateCcw className="h-3.5 w-3.5" /> {r.return_number}
                </p>
                <p className="text-xs text-slate-400">{formatDateTime(r.created_at)}</p>
              </div>
              <span className="font-semibold text-sm text-red-600">-{formatRupiah(r.total_refund)}</span>
            </div>
            <div className="text-xs text-slate-500">
              <span>Penjualan: <b className="text-primary-600">{r.sale?.invoice_number || '-'}</b></span>
              {r.customer?.name && <span> · {r.customer.name}</span>}
            </div>
            {r.reason && <p className="text-xs text-slate-400 line-clamp-2">Alasan: {r.reason}</p>}
            <div className="flex justify-end">
              <button onClick={(e) => { e.stopPropagation(); navigate(`/sales/${r.sale_id}`); }} className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-100 transition-colors">
                Lihat Penjualan
              </button>
            </div>
          </div>
        )}
        toolbar={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari no. retur / no. penjualan..." className="w-full sm:w-64" />}
      />
    </div>
  );
}
