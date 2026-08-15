import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RotateCcw, ReceiptText } from 'lucide-react';
import { salesApi, settingsApi, cashierApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  Card, Button, StatusBadge, Skeleton, ErrorState, EmptyState, Modal, Field, Textarea, Input, ConfirmDialog,
} from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime, formatQty, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';
import ReceiptModal from '../components/pos/ReceiptModal.jsx';

export default function SaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [showRefund, setShowRefund] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [settings, setSettings] = useState({});
  const [refundItems, setRefundItems] = useState({}); // sale_item_id -> qty
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);

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

  const openRefund = () => {
    setRefundItems({});
    setReason('');
    setShowRefund(true);
  };

  const doRefund = async () => {
    const items = Object.entries(refundItems)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => ({ sale_item_id: saleItemId, quantity: Number(qty) }));

    if (!items.length) {
      toast.error('Pilih minimal satu item');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Alasan retur minimal 3 karakter');
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
              <p className="mt-1 text-lg font-bold text-indigo-700">{formatRupiah(s.total)}</p>
            </Card>
          </div>

          <Card title="Item Transaksi" bodyClassName="p-0">
            {!s.items?.length ? (
              <EmptyState title="Tidak ada item" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Produk</th>
                    <th className="px-4 py-2.5 font-semibold">Qty</th>
                    <th className="px-4 py-2.5 font-semibold">Harga</th>
                    <th className="px-4 py-2.5 font-semibold">Harga Beli</th>
                    <th className="px-4 py-2.5 font-semibold">Diskon</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Laba</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.items.map((i) => {
                    const rem = remaining(i);
                    return (
                      <tr key={i.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-800">{i.product?.name || '-'}</p>
                          {rem < Number(i.quantity) && <p className="text-xs text-amber-600">Sisa dapat diretur: {formatQty(rem)}</p>}
                        </td>
                        <td className="px-4 py-2.5">{formatQty(i.quantity)}</td>
                        <td className="px-4 py-2.5">{formatRupiah(i.price)}</td>
                        <td className="px-4 py-2.5">{formatRupiah(i.cost_price)}</td>
                        <td className="px-4 py-2.5">{i.discount ? `-${formatRupiah(i.discount)}` : '-'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatRupiah(i.subtotal)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-emerald-600">{formatRupiah(i.profit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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
                  <span>Total</span><span className="text-indigo-700">{formatRupiah(s.total)}</span>
                </div>
                {s.payments?.[0]?.cash_received != null && (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">Bayar</span><span>{formatRupiah(s.payments[0].cash_received)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Kembali</span><span>{formatRupiah(s.payments[0].change_amount)}</span></div>
                  </>
                )}
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
            <Button variant="danger" onClick={() => setConfirmRefund(true)} disabled={!Object.values(refundItems).some((q) => Number(q) > 0)}>
              <RotateCcw className="h-4 w-4" /> Refund {totalRefund > 0 ? formatRupiah(totalRefund) : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            Pilih item dan jumlah yang diretur. Stok akan kembali, dan jika penjualan tunai, uang dikembalikan dari kas.
          </div>
          <div className="space-y-2">
            {(s?.items || []).map((item) => {
              const rem = remaining(item);
              if (rem <= 0) return null;
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.product?.name}</p>
                    <p className="text-xs text-slate-400">
                      Terjual {formatQty(item.quantity)} · Sisa retur {formatQty(rem)} · {formatRupiah(item.price)}/pcs
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={rem}
                    value={refundItems[item.id] || ''}
                    placeholder="0"
                    onChange={(e) => setRefundItems((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-24 text-right"
                  />
                </div>
              );
            })}
          </div>
          <Field label="Alasan Retur" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cth: produk rusak / salah barang" />
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
