import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RotateCcw, ReceiptText, Plus, Minus, Pencil, Trash2 } from 'lucide-react';
import { salesApi, settingsApi, cashierApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { DataTable, Pagination, Card } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Form.jsx';
import { StatusBadge, Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { formatRupiah, formatDateTime, formatQty, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter.js';
import { usePrinterConnect, DEFAULT_CONNECT_CONFIG } from '../context/PrinterConnectProvider.jsx';

const EDIT_REASONS = ['Salah jumlah (qty)', 'Salah harga', 'Salah pelanggan', 'Salah metode bayar', 'Barang dikembalikan / ganti barang'];
const EDIT_PAYMENT_METHODS = ['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'];

export default function SaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const bluetooth = useBluetoothPrinter();
  const { openConnectModal } = usePrinterConnect();
  const [showRefund, setShowRefund] = useState(false);
  const [refundItems, setRefundItems] = useState({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);

  // ---- Koreksi transaksi (Poin 5) ----
  const [showEdit, setShowEdit] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editPayment, setEditPayment] = useState('CASH');
  const [editCash, setEditCash] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);

  const detail = useApi(() => salesApi.get(id).then((r) => r.data), [id]);
  const s = detail.data;

  const openEdit = () => {
    if (!s) return;
    setEditItems(
      (s.items || []).map((i) => ({
        product_id: i.product_id,
        name: i.product?.name || '-',
        quantity: Number(i.quantity),
        price: Number(i.price),
        discount: Number(i.discount || 0),
      }))
    );
    setEditPayment(s.payment_method || 'CASH');
    const cashReceived = s.payments?.[0]?.cash_received;
    setEditCash(cashReceived == null ? '' : String(cashReceived));
    setEditReason('');
    setShowEdit(true);
  };

  const editSubtotal = (items) =>
    items.reduce((sum, i) => sum + Math.max(Number(i.price || 0), 0) * Math.max(Number(i.quantity || 0), 0) - Number(i.discount || 0), 0);

  const editTotal = useMemo(
    () => (s ? editSubtotal(editItems) - Number(s.discount || 0) + Number(s.tax || 0) + Number(s.additional_cost || 0) : 0),
    [editItems, s]
  );

  const editCashNum = editCash === '' ? null : Number(editCash) || null;
  const editSisaHutang = editCashNum == null ? 0 : Math.max(editTotal - editCashNum, 0);

  const editValidation = useMemo(() => {
    const errors = { items: '', reason: '' };
    if (!editItems.length) errors.items = 'Minimal satu item harus diisi';
    else if (editItems.some((i) => Number(i.quantity) <= 0)) errors.items = 'Jumlah (qty) harus lebih dari 0';
    else if (editItems.some((i) => Number(i.price) < 0)) errors.items = 'Harga tidak boleh negatif';
    if (editReason.trim().length < 3) errors.reason = 'Pilih alasan koreksi';
    return { isValid: !errors.items && !errors.reason, errors };
  }, [editItems, editReason]);

  const stepEditQty = (idx, delta) => {
    setEditItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, Number(it.quantity || 0) + delta) } : it))
    );
  };

  const doEdit = async () => {
    if (!editValidation.isValid) {
      toast.error(editValidation.errors.items || editValidation.errors.reason);
      return;
    }
    setEditSubmitting(true);
    try {
      await salesApi.edit(id, {
        items: editItems.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity), price: Number(i.price), discount: Number(i.discount || 0) })),
        reason: editReason,
        customer_id: s.customer_id,
        payment_method: editPayment,
        cash_received: editPayment === 'CASH' ? editCashNum : null,
      });
      toast.success('Transaksi berhasil dikoreksi — stok & hutang diperbarui');
      setShowEdit(false);
      setConfirmEdit(false);
      detail.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal mengoreksi transaksi'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const remaining = (item) => {
    const returned = (s?.returns || []).reduce(
      (sum, r) => sum + (r.items || []).filter((ri) => ri.sale_item_id === item.id).reduce((a, ri) => a + Number(ri.quantity), 0),
      0
    );
    return Number(item.quantity) - returned;
  };

  const totalRefund = (s?.items || []).reduce((sum, item) => {
    const q = Number(refundItems[item.id] || 0);
    if (q <= 0) return sum;
    // Harga efektif per unit setelah diskon item = subtotal / quantity
    const unit = Number(item.quantity > 0 ? (Number(item.subtotal || 0) / Number(item.quantity)) : 0);
    return sum + q * unit;
  }, 0);

  const refundRounding = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // Item yang masih bisa diretur (sisa > 0)
  const refundableItems = (s?.items || []).filter((item) => remaining(item) > 0);

  // Item yang sedang dipilih qty-nya > 0
  const selectedCount = refundableItems.filter((i) => Number(refundItems[i.id] || 0) > 0).length;
  const totalSelectedQty = refundableItems.reduce(
    (sum, i) => sum + Math.max(0, Number(refundItems[i.id] || 0)),
    0
  );

  // Pilih semua: isi qty = sisa untuk setiap item
  const selectAll = () => {
    if (!s?.items) return;
    const next = {};
    s.items.forEach((item) => {
      const rem = remaining(item);
      if (rem > 0) next[item.id] = rem;
    });
    setRefundItems(next);
  };

  // Stepper +/- qty retur
  const stepQty = (itemId, delta, rem) => {
    const cur = Number(refundItems[itemId] || 0);
    if (!Number.isFinite(cur) || !Number.isFinite(rem)) return;
    const next = Math.max(0, Math.min(rem, cur + delta));
    setRefundItems((prev) => ({ ...prev, [itemId]: next === 0 ? '' : String(next) }));
  };

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

  const reprintStruk = async () => {
    if (!s) return;
    try {
      toast.info('Mencetak struk...');
      const settingsRes = await settingsApi.get();
      await bluetooth.printStruk(s, settingsRes.data?.store, settingsRes.data?.pos);
      toast.success('Struk berhasil dicetak');
    } catch (error) {
      if (error?.response) {
        toast.error(getErrorMessage(error, 'Gagal memuat data struk'));
        return;
      }
      openConnectModal({
        ...DEFAULT_CONNECT_CONFIG,
        onConnected: () => reprintStruk(),
      });
    }
  };

  const printReceipt = async () => {
    if (!s) return;
    if (!bluetooth.supported) {
      toast.error('Browser tidak mendukung Web Bluetooth (butuh Chrome/Edge via HTTPS)');
      return;
    }
    if (!bluetooth.isConnected) {
      openConnectModal({
        ...DEFAULT_CONNECT_CONFIG,
        onConnected: () => reprintStruk(),
      });
      return;
    }
    await reprintStruk();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sales')} className="rounded-lg border-2 border-black bg-white p-2 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{s?.invoice_number || 'Detail Transaksi'}</h1>
            <p className="text-sm text-slate-500">{s ? formatDateTime(s.created_at) : ''} · {s?.cashier?.profiles?.full_name || s?.cashier?.username || '-'}</p>
          </div>
        </div>
        {s && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Printer} onClick={printReceipt}>Cetak Struk</Button>
            {can('sales.refund') && s.status === 'completed' && (
              <Button variant="outline" icon={Pencil} onClick={openEdit}>Koreksi</Button>
            )}
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
                <div className="flex justify-between border-t-2 border-black pt-2 text-base font-bold">
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
                        <div className="flex justify-between border-t-2 border-black pt-2">
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

      {/* Modal koreksi transaksi */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Koreksi Transaksi"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>Batal</Button>
            <Button onClick={() => setConfirmEdit(true)} disabled={!editValidation.isValid || editSubmitting}>
              <Pencil className="h-4 w-4" />
              {editSisaHutang > 0 ? `Simpan · Hutang ${formatRupiah(editSisaHutang)}` : 'Simpan Koreksi'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-black bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Cara koreksi:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
              <li>Ubah jumlah (qty) atau harga item yang salah.</li>
              <li>Pilih alasan koreksi (wajib).</li>
              <li>Stok & hutang pelanggan diperbarui otomatis sesuai perubahan.</li>
            </ol>
          </div>

          {editValidation.errors.items && (
            <p className="text-xs text-danger-600" role="alert">{editValidation.errors.items}</p>
          )}

          <div className="overflow-hidden rounded-lg border-2 border-black">
            <div className="hidden border-b-2 border-black bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[1fr_6rem_6.5rem_6rem_2.5rem] sm:gap-3">
              <span>Produk</span>
              <span className="text-center">Jumlah</span>
              <span className="text-center">Harga</span>
              <span className="text-right">Subtotal</span>
              <span className="text-right" />
            </div>
            <ul className="divide-y divide-slate-100">
              {editItems.map((item, idx) => {
                const lineTotal = Math.max(Number(item.price || 0), 0) * Math.max(Number(item.quantity || 0), 0) - Number(item.discount || 0);
                return (
                  <li key={item.product_id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_6rem_6.5rem_6rem_2.5rem] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                      {item.discount > 0 && <p className="text-xs text-emerald-600">diskon {formatRupiah(item.discount)}</p>}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => stepEditQty(idx, -1)}
                        disabled={Number(item.quantity) <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-black bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Kurangi jumlah ${item.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => {
                          const q = Number(e.target.value);
                          setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: Number.isFinite(q) && q > 0 ? q : 1 } : it)));
                        }}
                        className="w-16 text-center"
                        aria-label={`Jumlah ${item.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => stepEditQty(idx, +1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-black bg-white text-slate-600 transition-colors hover:bg-slate-50"
                        aria-label={`Tambah jumlah ${item.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={item.price}
                      onChange={(e) => {
                        const p = Number(e.target.value);
                        setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, price: Number.isFinite(p) && p >= 0 ? p : 0 } : it)));
                      }}
                      className="w-full text-right font-mono"
                      aria-label={`Harga ${item.name}`}
                    />
                    <div className="text-right font-mono text-sm font-semibold text-emerald-700">{formatRupiah(lineTotal)}</div>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-danger-50 hover:text-danger-600 transition-colors"
                        aria-label={`Hapus ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Alasan Koreksi" required error={editValidation.errors.reason}>
              <Select
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                error={!!editValidation.errors.reason}
              >
                <option value="">-- Pilih alasan --</option>
                {EDIT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Metode Pembayaran">
              <Select value={editPayment} onChange={(e) => setEditPayment(e.target.value)}>
                {EDIT_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
              </Select>
            </Field>
          </div>

          {editPayment === 'CASH' && (
            <Field label="Uang Diterima (Rp)" hint={editSisaHutang > 0 ? `Sisa ${formatRupiah(editSisaHutang)} menjadi hutang pelanggan` : 'Transaksi lunas'}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={editCash}
                  onChange={(e) => setEditCash(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
                {editCashNum != null && editCashNum < editTotal && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditCash(String(editTotal))}
                    className="shrink-0 whitespace-nowrap"
                  >
                    Bayar Lunas
                  </Button>
                )}
              </div>
            </Field>
          )}

          <div className="overflow-hidden rounded-lg border-2 border-black">
            <div className="space-y-1.5 px-4 py-3 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatRupiah(editSubtotal(editItems))}</span></div>
              <div className="flex justify-between text-slate-500"><span>Diskon</span><span>-{formatRupiah(s?.discount || 0)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Pajak</span><span>{formatRupiah(s?.tax || 0)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Biaya Lain</span><span>{formatRupiah(s?.additional_cost || 0)}</span></div>
              <div className="flex items-center justify-between border-t-2 border-black pt-2">
                <span className="text-sm font-semibold text-slate-700">Total Baru</span>
                <span className="font-mono text-lg font-bold text-primary-700">{formatRupiah(editTotal)}</span>
              </div>
              {editSisaHutang > 0 && (
                <div className="flex justify-between border-t-2 border-black pt-2 text-amber-700">
                  <span className="font-semibold">Sisa Jadi Hutang</span>
                  <span className="font-bold">{formatRupiah(editSisaHutang)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmEdit}
        onClose={() => setConfirmEdit(false)}
        onConfirm={doEdit}
        loading={editSubmitting}
        title="Simpan koreksi transaksi?"
        message={`Transaksi ${s?.invoice_number} akan diubah. Stok dan hutang pelanggan akan disesuaikan otomatis. Aksi ini tercatat di log audit.`}
        confirmText="Ya, simpan koreksi"
      />
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
              disabled={!refundValidation.isValid || submitting || totalRefund <= 0}
            >
              <RotateCcw className="h-4 w-4" />
              {totalRefund > 0 ? `Refund ${formatRupiah(refundRounding(totalRefund))}` : 'Refund'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Ringkasan transaksi */}
          <div className="rounded-lg border-2 border-black bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{s?.invoice_number}</p>
                <p className="text-xs text-slate-500">
                  {s?.customer?.name || 'Umum'} · {s ? formatDateTime(s.created_at) : ''}
                </p>
              </div>
              {s?.payment_method && (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${paymentMethodColor(s.payment_method)}`}>
                  {paymentMethodLabel(s.payment_method)}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-md border-2 border-black bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Cara retur:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
              <li>Pilih item dan jumlah yang diretur (pakai stepper atau ketik).</li>
              <li>Isi alasan retur (wajib, min. 3 karakter).</li>
              <li>Stok kembali otomatis; uang dikembalikan jika tunai.</li>
            </ol>
          </div>

          {/* Header daftar item + aksi cepat */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Item Transaksi</p>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              Pilih semua
            </button>
          </div>

          {refundValidation.errors.items && (
            <p className="text-xs text-danger-600" role="alert">{refundValidation.errors.items}</p>
          )}

          <div className="overflow-hidden rounded-lg border-2 border-black">
            {/* Header kolom */}
            <div className="hidden border-b-2 border-black bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[1fr_5rem_5.5rem_6.5rem] sm:gap-3">
              <span>Produk</span>
              <span className="text-center">Sisa</span>
              <span className="text-center">Jumlah</span>
              <span className="text-right">Subtotal</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {(s?.items || []).map((item) => {
                const rem = remaining(item);
                if (rem <= 0) {
                  return (
                    <li key={item.id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_5rem_5.5rem_6.5rem] sm:items-center sm:gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-500 line-through">{item.product?.name || '-'}</p>
                        <p className="text-xs text-slate-400">{item.product?.sku || ''}</p>
                      </div>
                      <div className="col-span-3 text-xs text-slate-400 sm:text-center">
                        Sudah diretur seluruhnya
                      </div>
                    </li>
                  );
                }
                const qty = refundItems[item.id] ?? '';
                const qtyNum = qty === '' ? 0 : Number(qty);
                const over = qty !== '' && qtyNum > rem;
                const unit = Number(item.quantity > 0 ? (Number(item.subtotal || 0) / Number(item.quantity)) : 0);
                const lineTotal = qtyNum > 0 ? qtyNum * unit : 0;
                return (
                  <li key={item.id} className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_5rem_5.5rem_6.5rem] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.product?.name || '-'}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatRupiah(unit)}/pcs
                        {item.discount > 0 && Number(item.discount) > 0 && (
                          <span className="ml-1 text-emerald-600">· diskon {formatRupiah(item.discount)}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="inline-flex items-center justify-center rounded-sm bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {formatQty(rem)}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => stepQty(item.id, -1, rem)}
                        disabled={qtyNum <= 0}
                        aria-label={`Kurangi jumlah retur ${item.product?.name || 'item'}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-black bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={qty}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                            setRefundItems((prev) => ({ ...prev, [item.id]: raw }));
                          }
                        }}
                        className="w-16 text-center"
                        error={over}
                        aria-label={`Jumlah retur ${item.product?.name || 'item'}`}
                      />
                      <button
                        type="button"
                        onClick={() => stepQty(item.id, +1, rem)}
                        disabled={qtyNum >= rem}
                        aria-label={`Tambah jumlah retur ${item.product?.name || 'item'}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-black bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-right">
                      {lineTotal > 0 ? (
                        <span className="font-mono text-sm font-semibold text-emerald-700">
                          {formatRupiah(refundRounding(lineTotal))}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>
                    {over && (
                      <p className="col-span-full -mt-1 text-xs text-danger-600" role="alert">
                        Maksimal {formatQty(rem)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {refundableItems.length === 0 && (
            <p className="rounded-md bg-slate-50 px-4 py-3 text-center text-sm text-slate-400">
              Semua item pada transaksi ini sudah diretur seluruhnya.
            </p>
          )}

          {/* Ringkasan total */}
          <div className="overflow-hidden rounded-lg border-2 border-black">
            <div className="space-y-1.5 px-4 py-3 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Item dipilih</span>
                <span className="font-medium text-slate-700">{selectedCount}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Total qty diretur</span>
                <span className="font-medium text-slate-700">{formatQty(totalSelectedQty)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t-2 border-black pt-2">
                <span className="text-sm font-semibold text-slate-700">Total Refund</span>
                <span className={`font-mono text-lg font-bold ${totalRefund > 0 ? 'text-danger-600' : 'text-slate-400'}`}>
                  {formatRupiah(refundRounding(totalRefund))}
                </span>
              </div>
            </div>
          </div>

          <Field label="Alasan Retur" required error={refundValidation.errors.reason} hint="Min. 3 karakter — cth: produk rusak, salah barang">
            <Textarea
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="cth: produk rusak / salah barang"
              error={!!refundValidation.errors.reason}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRefund}
        onClose={() => setConfirmRefund(false)}
        onConfirm={doRefund}
        loading={submitting}
        title="Konfirmasi retur?"
        message={`Total refund ${formatRupiah(refundRounding(totalRefund))} untuk ${selectedCount} item (${formatQty(totalSelectedQty)} qty) akan diproses. Stok kembali ke gudang dan status transaksi ditandai sebagai retur.`}
        confirmText="Ya, proses retur"
      />
    </div>
  );
}
