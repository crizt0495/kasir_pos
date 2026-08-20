import { useState } from 'react';
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { cashierApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Card, Button, Field, Input, Modal, ConfirmDialog, StatusBadge, Skeleton, EmptyState, Badge, PageHeader, Pagination } from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime, formatNumber } from '../utils/format.js';

export default function Cashier() {
  const { can } = usePermission();
  const [openingBalance, setOpeningBalance] = useState(0);
  const [opening, setOpening] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [txForm, setTxForm] = useState({ type: 'IN', amount: '', notes: '' });
  const [addingTx, setAddingTx] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const txPageSize = 20;

  const session = useApi(() => cashierApi.openSession().then((r) => r.data), []);
  // Ambil hingga 1000 transaksi untuk perhitungan kas yang akurat (server menghitung ulang saat tutup)
  const transactions = useApi(
    () => (session.data?.id ? cashierApi.transactions({ session_id: session.data.id, pageSize: 1000 }).then((r) => r.data) : Promise.resolve({ items: [] })),
    [session.data?.id]
  );

  const s = session.data;

  const open = async () => {
    setOpening(true);
    try {
      await cashierApi.open({ opening_balance: Number(openingBalance) || 0 });
      toast.success('Sesi kas dibuka');
      session.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal membuka kas'));
    } finally {
      setOpening(false);
    }
  };

  const addTx = async () => {
    if (!Number(txForm.amount)) {
      toast.error('Nominal wajib diisi');
      return;
    }
    setAddingTx(true);
    try {
      await cashierApi.addTransaction({ session_id: s.id, type: txForm.type, amount: Number(txForm.amount), notes: txForm.notes || null });
      toast.success('Transaksi kas ditambahkan');
      setShowAddTx(false);
      setTxForm({ type: 'IN', amount: '', notes: '' });
      transactions.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAddingTx(false);
    }
  };

  // Validasi lalu tampilkan dialog konfirmasi sebelum sesi benar-benar ditutup
  const requestClose = () => {
    if (Math.abs(Number(actualCash || 0) - expected) > 0 && !closeNote.trim()) {
      toast.error('Ada selisih kas — catatan wajib diisi');
      return;
    }
    setConfirmClose(true);
  };

  const close = async () => {
    setClosing(true);
    try {
      await cashierApi.close(s.id, { actual_cash: Number(actualCash) || 0, note: closeNote || null });
      toast.success('Sesi kas ditutup');
      setShowClose(false);
      setConfirmClose(false);
      session.reload();
      transactions.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menutup kas'));
    } finally {
      setClosing(false);
    }
  };

  // ===== Belum ada sesi terbuka =====
  if (!session.loading && !s) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader title="Kasir" description="Buka sesi kas untuk mulai melayani pembayaran tunai" />
        <Card bodyClassName="p-6">
          {!can('cashier.open') ? (
            <EmptyState title="Anda tidak memiliki izin membuka kas" />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <div className="rounded-full bg-emerald-100 p-3 text-emerald-600">
                  <Wallet className="h-8 w-8" />
                </div>
                <p className="text-sm text-slate-500">Masukkan saldo awal kas Anda</p>
              </div>
              <Field label="Saldo Awal (Rp)">
                <Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" autoFocus />
              </Field>
              <Button className="w-full" size="lg" onClick={open} loading={opening}>
                Buka Kas
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const expected = s ? Number(s.opening_balance) + (transactions.data?.items || []).reduce((sum, t) => sum + Number(t.amount), 0) : 0;
  const cashIn = (transactions.data?.items || []).filter((t) => Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0);
  const cashOut = (transactions.data?.items || []).filter((t) => Number(t.amount) < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kasir"
        description={`Sesi kas terbuka · dibuka ${s ? formatDateTime(s.opened_at) : ''}`}
        actions={can('cashier.close') && <Button onClick={() => { setActualCash(''); setCloseNote(''); setShowClose(true); }}>Tutup Kas</Button>}
      />

      {session.loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card bodyClassName="p-4">
            <p className="text-xs text-slate-400">Saldo Awal</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{formatRupiah(s.opening_balance)}</p>
          </Card>
          <Card bodyClassName="p-4">
            <p className="text-xs text-slate-400">Cash Masuk (Penjualan + IN)</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">{formatRupiah(cashIn)}</p>
          </Card>
          <Card bodyClassName="p-4">
            <p className="text-xs text-slate-400">Cash Keluar (Pengeluaran + OUT + Refund)</p>
            <p className="mt-1 text-lg font-bold text-red-600">{formatRupiah(cashOut)}</p>
          </Card>
          <Card bodyClassName="p-4">
            <p className="text-xs text-slate-400">Kas Yang Diharapkan</p>
            <p className="mt-1 text-lg font-bold text-primary-700">{formatRupiah(expected)}</p>
          </Card>
        </div>
      )}

      <Card
        title="Transaksi Kas"
        actions={
          can('cashier.open') && (
            <Button size="sm" variant="outline" icon={Plus} onClick={() => setShowAddTx(true)}>
              Tambah IN/OUT
            </Button>
          )
        }
        bodyClassName="p-0"
      >
        {transactions.loading ? (
          <Skeleton className="h-32 w-full m-4" />
        ) : !transactions.data?.items?.length ? (
          <EmptyState title="Belum ada transaksi kas" />
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {transactions.data.items.slice((txPage - 1) * txPageSize, txPage * txPageSize).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {Number(t.amount) >= 0 ? (
                      <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {t.type === 'SALE' ? 'Penjualan' : t.type === 'EXPENSE' ? 'Pengeluaran' : t.type === 'REFUND' ? 'Refund' : t.type === 'IN' ? 'Cash Masuk' : 'Cash Keluar'}
                      </p>
                      <p className="text-xs text-slate-400">{formatDateTime(t.created_at)} {t.notes ? `· ${t.notes}` : ''}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${Number(t.amount) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {Number(t.amount) >= 0 ? '+' : '-'}{formatRupiah(Math.abs(t.amount))}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200">
              <Pagination
                page={txPage}
                totalPages={Math.ceil(transactions.data.items.length / txPageSize)}
                total={transactions.data.items.length}
                pageSize={txPageSize}
                onPageChange={setTxPage}
              />
            </div>
          </>
        )}
      </Card>

      {/* Modal tutup kas */}
      <Modal
        open={showClose}
        onClose={() => setShowClose(false)}
        title="Tutup Sesi Kas"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowClose(false)}>Batal</Button>
            <Button onClick={requestClose}>Tutup Kas</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Saldo Awal</span><span>{formatRupiah(s.opening_balance)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cash Masuk</span><span className="text-emerald-600">+{formatRupiah(cashIn)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cash Keluar</span><span className="text-red-600">-{formatRupiah(cashOut)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
              <span>Kas yang Diharapkan</span>
              <span>{formatRupiah(expected)}</span>
            </div>
          </div>
          <Field label="Kas Aktual (hasil hitung fisik)" required>
            <Input type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} autoFocus />
          </Field>
          {Number(actualCash || 0) !== expected && (
            <div className={`rounded-lg p-3 text-sm ${Math.abs(Number(actualCash || 0) - expected) > 0 ? 'bg-amber-50 text-amber-700' : ''}`}>
              Selisih: <b>{formatRupiah(Number(actualCash || 0) - expected)}</b>. Jika ada selisih, catatan wajib diisi.
            </div>
          )}
          <Field label="Catatan" required={Math.abs(Number(actualCash || 0) - expected) > 0}>
            <Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="cth: selisih karena uang pas" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={close}
        loading={closing}
        title="Tutup sesi kas?"
        message={`Kas diharapkan ${formatRupiah(expected)} · Kas aktual ${formatRupiah(Number(actualCash || 0))} · Selisih ${formatRupiah(Number(actualCash || 0) - expected)}. Setelah ditutup, sesi tidak dapat dibuka kembali.`}
        confirmText="Ya, tutup kas"
      />

      {/* Modal tambah transaksi */}
      <Modal
        open={showAddTx}
        onClose={() => setShowAddTx(false)}
        title="Tambah Transaksi Kas"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddTx(false)}>Batal</Button>
            <Button onClick={addTx} loading={addingTx}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {['IN', 'OUT'].map((t) => (
              <button
                key={t}
                onClick={() => setTxForm({ ...txForm, type: t })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  txForm.type === t
                    ? t === 'IN' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-red-500 bg-red-50 text-red-700'
                    : 'border-slate-300 text-slate-600'
                }`}
              >
                {t === 'IN' ? 'Cash Masuk (IN)' : 'Cash Keluar (OUT)'}
              </button>
            ))}
          </div>
          <Field label="Nominal (Rp)">
            <Input type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
          </Field>
          <Field label="Catatan">
            <Input value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} placeholder="cth: ambil uang untuk belanja" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
