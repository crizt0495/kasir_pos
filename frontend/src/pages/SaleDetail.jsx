import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RotateCcw, ReceiptText } from 'lucide-react';
import { salesApi, settingsApi, cashierApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { DataTable, Pagination, Card } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { Field, Input, Textarea } from '../components/ui/Form.jsx';
import { StatusBadge, Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { formatRupiah, formatDateTime, formatQty, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';
import ReceiptModal from '../components/pos/ReceiptModal.jsx';

export default function SaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [showRefund, setShowRefund] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [settings, setSettings] = useState({});
  const [refundItems, setRefundItems] = useState({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);

  const detail = useApi(() => salesApi.get(id).then((r) => r.data), [id]);
  const s = detail.data;

  const remaining = (item) => {
    const returned = (s?.returns || []).reduce(
      (sum, r) => sum + (r.items || []).filter((ri) => ri.sale_item_id === item.id).reduce((a, ri) => a + Number(ri.quantity), 0),
      0
    );
    return Number(item.quantity) - returned;
  };

  const totalRefund = (s?.items || []).reduce((sum, item) => sum + (Number(refundItems[item.id] || 0) * Number(item.price)), 0);

  const refundValidation = useMemo(() => {
    const errors = { items: '', reason: '' };
    const selected = Object.values(refundItems).filter((q) => Number(q) > 0);
    if (!selected.length) errors.items = 'Pilih minimal satu item untuk diretur';
    const over = Object.entries(refundItems).find(([itemId, qty]) => {
      const item = s?.items?.find((i) => i.id === itemId);
      return item && Number(qty) > remaining(item);
    });
    if (over) errors.items = 'Jumlah retur melebihi sisa yang dapat diretur';
    if (reason.trim().length < 3) errors.reason = 'Alasan retur wajib diisi (min 3 karakter)';
    else if (reason.length > 1000) errors.reason = 'Alasan retur maksimal 1000 karakter';
    return { isValid: !errors.items && !errors.reason, errors };
  }, [refundItems, reason, s]);

  const openRefund = () => {
    setRefundItems({});
    setReason('');
    setShowRefund(true);
  };

  const doRefund = async () => {
    const items = Object.entries(refundItems)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => ({ sale_item_id: saleItemId, quantity: Number(qty) }));

    if (!refundValidation.isValid) {
      toast.error(refundValidation.errors.items || refundValidation.errors.reason);
      return;
    }

    let sessionId = null;
    try {
      const session = await cashierApi.openSession();
      sessionId = session.data?.id || null;
    } catch { /* tanpa sesi kas */ }

    setSubmitting(true);
    try {
      await salesApi.refund(id, { items, reason, session_id: sessionId });
      toast.success('Retur berhasil diproses — stok bertambah');
      setShowRefund(false);
      setConfirmRefund(false);
      detail.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal memproses retur'));
    } finally {
      setSubmitting(false);
    }
  };

  const openReceipt = async () => {
    try {
      const settingsRes = await settingsApi.get();
      setSettings(settingsRes.data);
      setShowReceipt(true);
    } catch {
      toast.error('Gagal memuat pengaturan');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sales')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{s?.invoice_number || 'Detail Transaksi'}</h1>
            <p className="text-sm text-slate-500">{s ? formatDateTime(s.created_at) : ''} · {s?.cashier?.profiles?.full_name || s?.cashier?.username || '-'}</p>
          </div>
        </div>
        {s && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Printer} onClick={openReceipt}>Cetak Struk</Button>
            {can('sales.refund') && s.status !== 'cancelled' && (
              <Button variant="outline" icon={RotateCcw} onClick={openRefund}>Retur</Button>
            )}
          </div>
        )}
      </div>

      {detail.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : detail.error ? (
        <ErrorState onRetry={detail.reload} />
      ) : !s ? null : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">Status</p>
              <div className="mt-1"><StatusBadge status={s.status} /></div>
            </Card>
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">Metode Pembayaran</p>
              <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${paymentMethodColor(s.payment_method)}`}>
                {paymentMethodLabel(s.payment_method)}
              </p>
            </Card>
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">Pelanggan</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{s.customer?.name || 'Umum'}</p>
            </Card>
            <Card bodyClassName="p-4">
              <p className="text-xs text-slate-400">Total</p>
              <p className="mt-1 text-lg font-bold text-primary-700">{formatRupiah(s.total)}</p>
            </Card>
          </div>

          <Card title="Item Transaksi" bodyClassName="p-0">
            {!s.items?.length ? (
              <EmptyState title="Tidak ada item" />
            ) : (() => {
              const itemsPageSize = 10;
              const itemsTotalPages = Math.ceil(s.items.length / itemsPageSize) || 1;
              const itemsFrom = (itemsPage - 1) * itemsPageSize;
              const pageItems = s.items.slice(itemsFrom, itemsFrom + itemsPageSize);
              return (
                <DataTable
                  columns={[
                    { key: 'product.name', headerLabel: 'Produk', render: (row) => {
                      const rem = remaining(row);
                      return (
                        <>
                          <p className="font-medium text-slate-800">{row.product?.name || '-'}</p>
                          {rem < Number(row.quantity) && <p className="text-xs text-amber-600">Sisa dapat diretur: {formatQty(rem)}</p>}
                        </>
                      );
                    }},
                    { key: 'quantity', headerLabel: 'Qty', render: (row) => formatQty(row.quantity) },
                    { key: 'price', headerLabel: 'Harga', render: (row) => formatRupiah(row.price) },
                    { key: 'cost_price', headerLabel: 'Harga Beli', render: (row) => formatRupiah(row.cost_price) },
                    { key: 'discount', headerLabel: 'Diskon', render: (row) => row.discount ? `-${formatRupiah(row.discount)}` : '-' },
                    { key: 'subtotal', headerLabel: 'Subtotal', align: 'right', render: (row) => formatRupiah(row.subtotal) },
                    { key: 'profit', headerLabel: 'Laba', align: 'right', render: (row) => <span className="font-medium text-emerald-600">{formatRupiah(row.profit)}</span> }
                  ]}
                  data={pageItems}
                  page={itemsPage}
                  totalPages={itemsTotalPages}
                  total={s.items.length}
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
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatRupiah(s.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span>-{formatRupiah(s.discount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Pajak</span><span>{formatRupiah(s.tax)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Biaya Lain</span><span>{formatRupiah(s.additional_cost)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Laba Transaksi</span><span className="font-medium text-emerald-600">{formatRupiah(s.profit)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                  <span>Total</span><span className="text-primary-700">{formatRupiah(s.total)}</span>
                </div>
                {s.payments?.[0]?.cash_received != null && (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">Bayar</span><span>{formatRupiah(s.payments[0].cash_received)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Kembali</span><span>{formatRupiah(s.payments[0].change_amount)}</span></div>
                  </>
                )}
                {(() => {
                  const cashReceived = Number(s.payments?.[0]?.cash_received);
                  const total = Number(s.total || 0);
                  if (s.payments?.[0]?.cash_received != null && cashReceived < total) {
                    return (
                      <>
                        <div className="flex justify-between border-t border-amber-200 pt-2">
                          <span className="text-amber-600 font-semibold">Sisa Hutang</span>
                          <span className="font-bold text-amber-700">{formatRupiah(total - cashReceived)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-amber-600">Status</span>
                          <span className="font-medium text-amber-700">BELUM LUNAS</span>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </Card>
          </div>

          {s.returns?.length > 0 && (
            <Card title="Riwayat Retur" bodyClassName="divide-y divide-slate-100">
              {s.returns.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{r.return_number}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(r.created_at)} · {r.reason || '-'}</p>
                  </div>
                  <p className="text-sm font-semibold text-red-600">-{formatRupiah(r.total_refund)}</p>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* Modal retur */}
      <Modal
        open={showRefund}
        onClose={() => setShowRefund(false)}
        title="Retur Penjualan"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRefund(false)}>Batal</Button>
            <Button
              variant="danger"
              onClick={() => setConfirmRefund(true)}
              disabled={!refundValidation.isValid || submitting}
            >
              <RotateCcw className="h-4 w-4" /> Refund {totalRefund > 0 ? formatRupiah(totalRefund) : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            Pilih item dan jumlah yang diretur. Stok akan kembali, dan jika penjualan tunai, uang dikembalikan dari kas.
          </div>
          {refundValidation.errors.items && (
            <p className="-mt-2 text-xs text-danger-600" role="alert">{refundValidation.errors.items}</p>
          )}
          <div className="space-y-2">
            {(s?.items || []).map((item) => {
              const rem = remaining(item);
              if (rem <= 0) return null;
              const qty = Number(refundItems[item.id] || 0);
              const over = qty > rem;
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.product?.name}</p>
                    <p className="text-xs text-slate-400">
                      Terjual {formatQty(item.quantity)} · Sisa retur {formatQty(rem)} · {formatRupiah(item.price)}/pcs
                    </p>
                    {over && <p className="mt-0.5 text-xs text-danger-600" role="alert">Maksimal {formatQty(rem)}</p>}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={rem}
                    value={refundItems[item.id] || ''}
                    placeholder="0"
                    onChange={(e) => setRefundItems((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-24 text-right"
                    error={over}
                  />
                </div>
              );
            })}
          </div>
          <Field label="Alasan Retur" required error={refundValidation.errors.reason}>
            <Textarea rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cth: produk rusak / salah barang" error={!!refundValidation.errors.reason} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRefund}
        onClose={() => setConfirmRefund(false)}
        onConfirm={doRefund}
        loading={submitting}
        title="Konfirmasi retur?"
        message={`Total refund ${formatRupiah(totalRefund)} akan diproses. Stok kembali ke gudang.`}
        confirmText="Ya, proses retur"
      />

      <ReceiptModal open={showReceipt} onClose={() => setShowReceipt(false)} sale={s} settings={settings} />
    </div>
  );
}
