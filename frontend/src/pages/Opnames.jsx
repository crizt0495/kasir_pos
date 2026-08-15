import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardCheck, Trash2, XCircle, Eye } from 'lucide-react';
import { inventoryApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, Button, StatusBadge, ConfirmDialog } from '../components/ui/index.jsx';
import { formatDate, formatQty } from '../utils/format.js';

export default function Opnames() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState(null);
  const [toComplete, setToComplete] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [acting, setActing] = useState(false);

  const list = useApi(
    () => inventoryApi.opnames({ status: status || undefined, page, pageSize: 20 }).then((r) => r.data),
    [status, page]
  );

  const complete = async () => {
    setActing(true);
    try {
      await inventoryApi.completeOpname(toComplete.id);
      toast.success('Stock opname selesai — stok disesuaikan dengan stok fisik');
      setToComplete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyelesaikan opname'));
    } finally {
      setActing(false);
    }
  };

  const cancel = async () => {
    setActing(true);
    try {
      await inventoryApi.cancelOpname(toCancel.id);
      toast.success('Stock opname dibatalkan');
      setToCancel(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setActing(false);
    }
  };

  const remove = async () => {
    setActing(true);
    try {
      await inventoryApi.deleteOpname(toDelete.id);
      toast.success('Stock opname dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setActing(false);
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock Opname</h1>
          <p className="text-sm text-slate-500">Cocokkan stok sistem dengan stok fisik</p>
        </div>
        {can('stock_opname.create') && (
          <Button icon={Plus} onClick={() => navigate('/inventory/opname/new')}>Buat Opname</Button>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'opname_date', header: 'Tanggal', render: (r) => formatDate(r.opname_date) },
          { key: 'creator', header: 'Dibuat Oleh', render: (r) => r.creator?.profiles?.full_name || r.creator?.username || '-' },
          { key: 'item_count', header: 'Jumlah Produk', render: (r) => formatQty(r.item_count) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              <button onClick={() => navigate(`/inventory/opname/${r.id}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600">
                <Eye className="h-4 w-4" />
              </button>
              {r.status === 'draft' && can('stock_opname.update') && (
                <>
                  <button onClick={() => setToComplete(r)} title="Selesaikan" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50">
                    <ClipboardCheck className="h-4 w-4" />
                  </button>
                  <button onClick={() => setToCancel(r)} title="Batalkan" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <XCircle className="h-4 w-4" />
                  </button>
                </>
              )}
              {r.status === 'draft' && can('stock_opname.delete') && (
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
        toolbar={
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        }
      />

      <ConfirmDialog
        open={!!toComplete}
        onClose={() => setToComplete(null)}
        onConfirm={complete}
        loading={acting}
        title="Selesaikan stock opname?"
        message="Stok sistem akan disesuaikan menjadi stok fisik. Selisih tercatat sebagai pergerakan stok. Tindakan ini tidak dapat dibatalkan."
        confirmText="Ya, selesaikan"
      />
      <ConfirmDialog
        open={!!toCancel}
        onClose={() => setToCancel(null)}
        onConfirm={cancel}
        loading={acting}
        title="Batalkan stock opname?"
        message="Stock opname draft akan dibatalkan."
        confirmText="Ya, batalkan"
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={acting}
        title="Hapus stock opname?"
        message="Data stock opname draft akan dihapus."
        confirmText="Ya, hapus"
      />
    </div>
  );
}
