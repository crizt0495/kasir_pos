import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Pencil, Trash2 } from 'lucide-react';
import { purchasesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Card, Button, StatusBadge, ConfirmDialog, Skeleton, ErrorState, EmptyState, Select, Pagination, DataTable } from '../components/ui/index.jsx';
import { formatRupiah, formatDate, formatQty } from '../utils/format.js';

export default function PurchaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [toReceive, setToReceive] = useState(false);
  const [toDelete, setToDelete] = useState(false);
  const [acting, setActing] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);

  const detail = useApi(() => purchasesApi.get(id).then((r) => r.data), [id]);
  const p = detail.data;

  const receive = async () => {
    setActing(true);
    try {
      await purchasesApi.receive(id);
      toast.success('Pembelian diterima — stok bertambah');
      setToReceive(false);
      detail.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menerima pembelian'));
    } finally {
      setActing(false);
    }
  };

  const remove = async () => {
    setActing(true);
    try {
      await purchasesApi.remove(id);
      toast.success('Pembelian dihapus');
      navigate('/purchases');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setActing(false);
    }
  };

  const setPayment = async (payment_status) => {
    try {
      await purchasesApi.payment(id, { payment_status });
      toast.success('Status pembayaran diperbarui');
      detail.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchases')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{p?.purchase_number || 'Detail Pembelian'}</h1>
            <p className="text-sm text-slate-500">{p?.supplier?.name || '-'} · {p ? formatDate(p.purchase_date) : ''}</p>
          </div>
        </div>
        {p && (
          <div className="flex gap-2">
            {p.status === 'draft' && can('purchases.update') && (
              <>
                <Button variant="outline" icon={PackageCheck} onClick={() => setToReceive(true)}>Terima Barang</Button>
                <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/purchases/${id}/edit`)}>Edit</Button>
              </>
            )}
            {p.status === 'draft' && can('purchases.delete') && (
              <Button variant="danger" icon={Trash2} onClick={() => setToDelete(true)}>Hapus</Button>
            )}
          </div>
        )}
      </div>

      {detail.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : detail.error ? (
        <ErrorState onRetry={detail.reload} />
      ) : !p ? null : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">Status</p>
              <div className="mt-1"><StatusBadge status={p.status} /></div>
            </Card>
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">Pembayaran</p>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={p.payment_status} />
                {can('purchases.update') && p.status !== 'cancelled' && (
                  <Select
                    value={p.payment_status}
                    onChange={(e) => setPayment(e.target.value)}
                    className="w-36 !py-1 text-xs"
                  >
                    <option value="unpaid">Belum Bayar</option>
                    <option value="partial">Sebagian</option>
                    <option value="paid">Lunas</option>
                  </Select>
                )}
              </div>
            </Card>
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">No. Invoice Supplier</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{p.invoice_number || '-'}</p>
            </Card>
          </div>

          <Card title="Item Pembelian" bodyClassName="p-0">
            {!p.items?.length ? (
              <EmptyState title="Tidak ada item" />
            ) : (() => {
              const itemsPageSize = 10;
              const itemsTotalPages = Math.ceil(p.items.length / itemsPageSize) || 1;
              const itemsFrom = (itemsPage - 1) * itemsPageSize;
              const pageItems = p.items.slice(itemsFrom, itemsFrom + itemsPageSize);
              return (
                <DataTable
                  columns={[
                    { key: 'product.name', headerLabel: 'Produk', render: (row) => (
                      <>
                        <p className="font-medium text-slate-800">{row.product?.name || '-'}</p>
                        <p className="text-xs text-slate-400">{row.product?.sku}</p>
                      </>
                    ) },
                    { key: 'quantity', headerLabel: 'Qty', render: (row) => formatQty(row.quantity) },
                    { key: 'cost_price', headerLabel: 'Harga Beli', render: (row) => formatRupiah(row.cost_price) },
                    { key: 'subtotal', headerLabel: 'Subtotal', align: 'right', render: (row) => formatRupiah(row.subtotal) }
                  ]}
                  data={pageItems}
                  page={itemsPage}
                  totalPages={itemsTotalPages}
                  total={p.items.length}
                  pageSize={itemsPageSize}
                  onPageChange={setItemsPage}
                  className="w-full"
                />
              );
            })()}
          </Card>

          <div className="flex justify-end">
            <Card bodyClassName="p-4 w-72">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatRupiah(p.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span>-{formatRupiah(p.discount)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                  <span>Total</span><span className="text-primary-700">{formatRupiah(p.total)}</span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={toReceive}
        onClose={() => setToReceive(false)}
        onConfirm={receive}
        loading={acting}
        title="Terima pembelian ini?"
        message="Stok produk akan bertambah sesuai item pembelian."
        confirmText="Ya, terima"
      />
      <ConfirmDialog
        open={toDelete}
        onClose={() => setToDelete(false)}
        onConfirm={remove}
        loading={acting}
        title="Hapus pembelian?"
        confirmText="Ya, hapus"
      />
    </div>
  );
}
