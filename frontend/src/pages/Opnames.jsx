import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardCheck, Trash2, XCircle, Eye } from 'lucide-react';
import { inventoryApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, Button, StatusBadge, ConfirmDialog, PageHeader } from '../components/ui/index.jsx';
import { formatDateTime, formatQty } from '../utils/format.js';

export default function Opnames() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [toDelete, setToDelete] = useState(null);
  const [toComplete, setToComplete] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [acting, setActing] = useState(false);

  const list = useApi(
    () => inventoryApi.opnames({ status: status || undefined, page, pageSize }).then((r) => r.data),
    [status, page, pageSize]
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
      <PageHeader
        title="Stock Opname"
        description="Cocokkan stok sistem dengan stok fisik"
        actions={can('stock_opname.create') && <Button icon={Plus} onClick={() => navigate('/inventory/opname/new')}>Buat Opname</Button>}
      />

      <DataTable
        columns={[
          { key: 'opname_date', header: 'Tanggal', render: (r) => formatDateTime(r.opname_date) },
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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        renderCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800">{formatDateTime(r.opname_date)}</p>
                <p className="text-xs text-slate-400">Oleh: {r.creator?.profiles?.full_name || r.creator?.username || '-'}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{formatQty(r.item_count)} produk</span>
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); navigate(`/inventory/opname/${r.id}`); }} className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-100 transition-colors">
                  Detail
                </button>
                {r.status === 'draft' && can('stock_opname.update') && (
                  <button onClick={(e) => { e.stopPropagation(); setToComplete(r); }} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100 transition-colors">
                    Selesai
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
