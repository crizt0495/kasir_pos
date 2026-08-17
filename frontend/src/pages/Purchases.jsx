import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, PackageCheck } from 'lucide-react';
import { purchasesApi, suppliersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Select, Button, StatusBadge, ConfirmDialog, PageHeader } from '../components/ui/index.jsx';
import { formatRupiah, formatDate } from '../utils/format.js';

export default function Purchases() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [toReceive, setToReceive] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [acting, setActing] = useState(false);

  // Dropdown supplier hanya dimuat bila user punya izin melihat supplier
  const suppliers = useApi(
    () => (can('suppliers.view') ? suppliersApi.list({ pageSize: 100 }).then((r) => r.data) : Promise.resolve({ items: [] })),
    []
  );
  const list = useApi(
    () => purchasesApi.list({ search: debounced || undefined, supplier_id: supplierId || undefined, status: status || undefined, page, pageSize: 20 }).then((r) => r.data),
    [debounced, supplierId, status, page]
  );

  const receive = async () => {
    setActing(true);
    try {
      await purchasesApi.receive(toReceive.id);
      toast.success('Pembelian diterima — stok bertambah');
      setToReceive(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menerima pembelian'));
    } finally {
      setActing(false);
    }
  };

  const remove = async () => {
    setActing(true);
    try {
      await purchasesApi.remove(toDelete.id);
      toast.success('Pembelian dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus pembelian'));
    } finally {
      setActing(false);
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pembelian"
        description="Kelola pembelian dari supplier"
        actions={can('purchases.create') && <Button icon={Plus} onClick={() => navigate('/purchases/new')}>Tambah Pembelian</Button>}
      />

      <DataTable
        columns={[
          { key: 'purchase_number', header: 'No. Pembelian', render: (r) => <span className="font-medium text-primary-600">{r.purchase_number}</span> },
          { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name || '-' },
          { key: 'purchase_date', header: 'Tanggal', render: (r) => formatDate(r.purchase_date) },
          { key: 'total', header: 'Total', render: (r) => <span className="font-semibold">{formatRupiah(r.total)}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'payment_status', header: 'Pembayaran', render: (r) => <StatusBadge status={r.payment_status} /> },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(`/purchases/${r.id}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600">
                <Eye className="h-4 w-4" />
              </button>
              {r.status === 'draft' && can('purchases.update') && (
                <>
                  <button onClick={() => setToReceive(r)} title="Terima (stok masuk)" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50">
                    <PackageCheck className="h-4 w-4" />
                  </button>
                  <button onClick={() => navigate(`/purchases/${r.id}/edit`)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
                    <Eye className="h-4 w-4" />
                  </button>
                </>
              )}
              {r.status === 'draft' && can('purchases.delete') && (
                <button onClick={() => setToDelete(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )},
        ]}
        data={d?.items || []}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        totalPages={d?.totalPages}
        total={d?.total}
        pageSize={d?.pageSize}
        onPageChange={setPage}
        renderCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-primary-600">{r.purchase_number}</p>
                <p className="text-xs text-slate-400">{r.supplier?.name || '-'} · {formatDate(r.purchase_date)}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{formatRupiah(r.total)}</span>
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); navigate(`/purchases/${r.id}`); }} className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-100 transition-colors">
                  Detail
                </button>
                {r.status === 'draft' && can('purchases.update') && (
                  <button onClick={(e) => { e.stopPropagation(); setToReceive(r); }} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100 transition-colors">
                    Terima
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari no. pembelian / invoice..." className="w-full sm:w-64" />
            <div className="flex flex-wrap gap-2">
              <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(1); }} className="w-full sm:w-44">
                <option value="">Semua Supplier</option>
                {(suppliers.data?.items || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full sm:w-36">
                <option value="">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="received">Diterima</option>
                <option value="cancelled">Dibatalkan</option>
              </Select>
            </div>
          </>
        }
      />

      <ConfirmDialog
        open={!!toReceive}
        onClose={() => setToReceive(null)}
        onConfirm={receive}
        loading={acting}
        title="Terima pembelian ini?"
        message="Stok produk akan bertambah sesuai item pembelian. Pastikan barang sudah sesuai."
        confirmText="Ya, terima"
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={acting}
        title="Hapus pembelian?"
        message="Hanya pembelian draft yang dapat dihapus."
        confirmText="Ya, hapus"
      />
    </div>
  );
}
