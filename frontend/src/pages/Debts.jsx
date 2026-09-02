import { useMemo, useState } from 'react';
import { Plus, AlertTriangle, CheckCircle2, Receipt, CreditCard, FileText, History, Ban } from 'lucide-react';
import { customersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { validateSchema } from '../utils/validation.js';
import { debtCreateSchema, debtPaySchema } from '../schemas/debts.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  DataTable, SearchInput, Button, Modal, Field, Input, Textarea, Select, PageHeader,
  StatCard, ProgressBar, CurrencyInput, Badge, ConfirmDialog, Skeleton, ErrorState, EmptyState,
} from '../components/ui/index.jsx';
import {
  formatRupiah, formatDate, formatDateTime, debtStatusLabel, debtStatusColor,
} from '../utils/format.js';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Belum Bayar' },
  { value: 'partial', label: 'Sebagian' },
  { value: 'paid', label: 'Lunas' },
  { value: 'overdue', label: 'Jatuh Tempo' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

const emptyCreate = { customer_id: '', amount: '', due_date: '', notes: '' };
const emptyPay = { amount: '' };

export default function Debts() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const [payOpen, setPayOpen] = useState(false);
  const [payDebt, setPayDebt] = useState(null);
  const [payForm, setPayForm] = useState(emptyPay);
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDebt, setDetailDebt] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Riwayat pembayaran (spec §9)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDebt, setHistoryDebt] = useState(null);
  const [history, setHistory] = useState({ loading: false, data: null, error: null });

  // Pembatalan hutang (spec §20)
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelDebt, setCancelDebt] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const list = useApi(
    () => customersApi.listDebts({
      search: debounced || undefined,
      status: statusFilter || undefined,
      page, pageSize,
    }).then((r) => r.data),
    [debounced, statusFilter, page, pageSize]
  );

  const summary = useApi(async () => {
    const items = list.data?.items || [];
    const totalDebt = items.reduce((s, d) => s + Number(d.amount || 0), 0);
    const totalPaid = items.reduce((s, d) => s + Number(d.paid_amount || 0), 0);
    const pendingDebt = items.reduce((s, d) => s + Math.max(0, Number(d.amount || 0) - Number(d.paid_amount || 0)), 0);
    const pendingCount = items.filter((d) => d.status === 'pending' || d.status === 'partial').length;
    const overdueCount = items.filter((d) => d.status === 'overdue').length;
    return { totalDebt, totalPaid, pendingDebt, pendingCount, overdueCount, total: list.data?.total || 0 };
  }, [list.data]);

  const { isValid: createValid, errors: createErrors } = useMemo(
    () => validateSchema(debtCreateSchema, createForm),
    [createForm]
  );
  const { isValid: payValid, errors: payErrors } = useMemo(
    () => validateSchema(debtPaySchema, payForm),
    [payForm]
  );

  const handleCustomerSearch = async (val) => {
    setCustomerSearch(val);
    if (!val.trim()) { setCustomerResults([]); return; }
    setCustomerLoading(true);
    try {
      const res = await customersApi.list({ search: val, pageSize: 20, is_general: 'false' });
      setCustomerResults(res.data?.items || []);
    } catch { setCustomerResults([]); }
    setCustomerLoading(false);
  };

  const openCreate = () => {
    setCreateForm(emptyCreate);
    setCustomerSearch('');
    setCustomerResults([]);
    setCreateError('');
    setCreateOpen(true);
  };

  const saveCreate = async () => {
    if (!createValid) { setCreateError('Data belum lengkap'); return; }
    setCreateSaving(true);
    try {
      await customersApi.createDebt({
        customer_id: createForm.customer_id,
        amount: Number(createForm.amount),
        due_date: createForm.due_date,
        notes: createForm.notes || null,
      });
      toast.success('Hutang berhasil dicatat');
      setCreateOpen(false);
      list.reload();
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Gagal mencatat hutang'));
    } finally {
      setCreateSaving(false);
    }
  };

  const openPay = (debt) => {
    setPayDebt(debt);
    setPayForm({ amount: String(debt.remaining_amount ?? (Number(debt.amount) - Number(debt.paid_amount))) });
    setPayError('');
    setPayOpen(true);
  };

  const savePay = async () => {
    if (!payValid) { setPayError('Nominal tidak valid'); return; }
    setPaySaving(true);
    try {
      await customersApi.payDebt(payDebt.id, { amount: Number(payForm.amount) });
      toast.success('Pembayaran hutang berhasil');
      setPayOpen(false);
      list.reload();
    } catch (err) {
      setPayError(getErrorMessage(err, 'Gagal mencatat pembayaran'));
    } finally {
      setPaySaving(false);
    }
  };

  const openDetail = async (debt) => {
    setDetailDebt(debt);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await customersApi.listDebts({ page: 1, pageSize: 1 });
      const found = (res.data?.items || []).find((d) => d.id === debt.id);
      if (found) setDetailDebt(found);
    } catch { /* abaikan */ }
    setDetailLoading(false);
  };

  const openHistory = async (debt) => {
    setHistoryDebt(debt);
    setHistoryOpen(true);
    setHistory({ loading: true, data: null, error: null });
    try {
      const res = await customersApi.paymentHistory(debt.id);
      setHistory({ loading: false, data: res.data, error: null });
    } catch (err) {
      setHistory({ loading: false, data: null, error: getErrorMessage(err, 'Gagal memuat riwayat') });
    }
  };

  const openCancel = (debt) => {
    setCancelDebt(debt);
    setCancelReason('');
    setCancelError('');
    setCancelOpen(true);
  };

  const saveCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError('Alasan pembatalan wajib diisi');
      return;
    }
    setCancelSaving(true);
    setCancelError('');
    try {
      await customersApi.cancelDebt(cancelDebt.id, { reason: cancelReason });
      toast.success('Hutang berhasil dibatalkan');
      setCancelOpen(false);
      list.reload();
    } catch (err) {
      setCancelError(getErrorMessage(err, 'Gagal membatalkan hutang'));
    } finally {
      setCancelSaving(false);
    }
  };

  const items = list.data?.items || [];
  const s = summary.data || { totalDebt: 0, totalPaid: 0, pendingDebt: 0, pendingCount: 0, overdueCount: 0 };

  const progressPercent = (debt) => {
    const amount = Number(debt.amount || 0);
    if (!amount) return 0;
    return Math.min(100, (Number(debt.paid_amount || 0) / amount) * 100);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hutang Pelanggan"
        description="Catat dan kelola hutang pelanggan serta pembayarannya"
        actions={can('customers.create') && (
          <Button icon={Plus} onClick={openCreate}>Catat Hutang</Button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Hutang"
          value={formatRupiah(s.totalDebt)}
          icon={Receipt}
          color="bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-md shadow-primary-500/25"
          sub={`${s.total || 0} catatan`}
        />
        <StatCard
          label="Sisa Belum Bayar"
          value={formatRupiah(s.pendingDebt)}
          icon={AlertTriangle}
          color="bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-md shadow-rose-500/25"
          sub={`${s.pendingCount || 0} catatan aktif`}
        />
        <StatCard
          label="Sudah Dibayar"
          value={formatRupiah(s.totalPaid)}
          icon={CheckCircle2}
          color="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/25"
        />
        <StatCard
          label="Jatuh Tempo"
          value={s.overdueCount || 0}
          icon={CreditCard}
          color="bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/25"
          sub="perlu ditagih"
        />
      </div>

      <DataTable
        storageKey="debts"
        columns={[
          {
            key: 'customer', header: 'Pelanggan',
            render: (r) => (
              <div>
                <p className="font-medium text-slate-900">{r.customer?.name || '-'}</p>
                <p className="text-xs text-slate-400">{r.customer?.phone || '-'}</p>
              </div>
            ),
          },
          {
            key: 'amount', header: 'Total',
            render: (r) => <span className="font-semibold font-mono text-slate-800">{formatRupiah(r.amount)}</span>,
          },
          {
            key: 'paid_amount', header: 'Progress',
            render: (r) => (
              <div className="min-w-[120px]">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-emerald-600 font-mono">{formatRupiah(r.paid_amount)}</span>
                  <span className="text-slate-400">{Math.round(progressPercent(r))}%</span>
                </div>
                <ProgressBar value={progressPercent(r)} max={100} color={progressPercent(r) >= 100 ? 'success' : 'primary'} />
              </div>
            ),
          },
          {
            key: 'remaining', header: 'Sisa',
            render: (r) => {
              const rem = Math.max(0, Number(r.amount || 0) - Number(r.paid_amount || 0));
              return <span className={`font-semibold font-mono ${rem > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatRupiah(rem)}</span>;
            },
          },
          {
            key: 'status', header: 'Status',
            render: (r) => <Badge color={debtStatusColor(r.status)}>{debtStatusLabel(r.status)}</Badge>,
          },
          {
            key: 'due_date', header: 'Jatuh Tempo',
            render: (r) => {
              const overdue = r.due_date && r.status !== 'paid' && r.status !== 'cancelled' && new Date(r.due_date) < new Date();
              return (
                <span className={overdue ? 'text-rose-600 font-medium' : 'text-slate-600'}>
                  {r.due_date ? formatDate(r.due_date) : '-'}
                  {overdue && ' · terlambat'}
                </span>
              );
            },
          },
          {
            key: 'created_at', header: 'Tanggal',
            render: (r) => <span className="text-slate-500 text-xs">{formatDateTime(r.created_at)}</span>,
          },
          {
            key: 'actions', header: 'Aksi', align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                {can('customers.update') && (r.status === 'pending' || r.status === 'partial' || r.status === 'overdue') && (
                  <button
                    onClick={() => openPay(r)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    Bayar
                  </button>
                )}
                <button
                  onClick={() => openHistory(r)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                  aria-label="Lihat riwayat pembayaran"
                  title="Riwayat Pembayaran"
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openDetail(r)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                  aria-label="Lihat detail"
                  title="Detail"
                >
                  <FileText className="h-4 w-4" />
                </button>
                {can('customers.update') && r.status === 'pending' && Number(r.paid_amount || 0) === 0 && (
                  <button
                    onClick={() => openCancel(r)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    aria-label="Batalkan hutang"
                    title="Batalkan"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                )}
              </div>
            ),
          },
        ]}
        data={items}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        emptyText="Belum ada catatan hutang"
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari catatan..." className="w-full sm:w-56" />
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full sm:w-40">
              <option value="">Semua Status</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </>
        }
      />

      {/* Modal: Catat Hutang */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Catat Hutang Baru"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={saveCreate} loading={createSaving} disabled={!createValid}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Pelanggan" required error={createErrors.customer_id || createError}>
            <div className="relative">
              <Input
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                placeholder="Ketik nama atau nomor HP..."
                error={!!createErrors.customer_id}
              />
              {customerLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">memuat...</span>}
            </div>
            {customerResults.length > 0 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {customerResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCreateForm((f) => ({ ...f, customer_id: c.id }));
                        setCustomerSearch(c.name);
                        setCustomerResults([]);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors"
                    >
                      <span className="font-medium text-slate-800">{c.name}</span>
                      {c.phone && <span className="ml-2 text-xs text-slate-400">{c.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {createForm.customer_id && (
              <p className="mt-1 text-xs text-emerald-600">✓ Pelanggan dipilih</p>
            )}
          </Field>
          <Field label="Nominal Hutang (Rp)" required error={createErrors.amount}>
            <CurrencyInput
              value={createForm.amount}
              onChange={(num) => setCreateForm((f) => ({ ...f, amount: num }))}
              placeholder="0"
              error={!!createErrors.amount}
            />
          </Field>
          <Field label="Jatuh Tempo" required error={createErrors.due_date}>
            <Input
              type="date"
              value={createForm.due_date}
              onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))}
              error={!!createErrors.due_date}
            />
          </Field>
          <Field label="Catatan">
            <Textarea
              rows={2}
              maxLength={1000}
              value={createForm.notes}
              onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opsional — mis. alasan atau no. referensi"
            />
          </Field>
        </div>
      </Modal>

      {/* Modal: Bayar Hutang */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Bayar Hutang"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>Batal</Button>
            <Button onClick={savePay} loading={paySaving} disabled={!payValid}>Proses Pembayaran</Button>
          </>
        }
      >
        {payDebt && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pelanggan</span>
                <span className="font-medium text-slate-800">{payDebt.customer?.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Hutang</span>
                <span className="font-semibold font-mono">{formatRupiah(payDebt.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sudah Dibayar</span>
                <span className="font-medium text-emerald-600 font-mono">{formatRupiah(payDebt.paid_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500">Sisa</span>
                <span className="font-bold text-rose-600 font-mono">
                  {formatRupiah(Math.max(0, Number(payDebt.amount) - Number(payDebt.paid_amount)))}
                </span>
              </div>
            </div>
            <Field label="Jumlah Bayar (Rp)" required error={payErrors.amount || payError}>
              <CurrencyInput
                value={payForm.amount}
                onChange={(num) => setPayForm({ amount: num })}
                placeholder="0"
                error={!!payErrors.amount}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Modal: Detail Hutang */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Detail Hutang"
        size="md"
        footer={<Button variant="secondary" onClick={() => setDetailOpen(false)}>Tutup</Button>}
      >
        {detailDebt && (
          <div className="space-y-3 text-sm">
            <DetailRow label="Pelanggan" value={detailDebt.customer?.name} />
            <DetailRow label="Telepon" value={detailDebt.customer?.phone} />
            <DetailRow label="Total Hutang" value={formatRupiah(detailDebt.amount)} />
            <DetailRow label="Sudah Dibayar" value={formatRupiah(detailDebt.paid_amount)} />
            <DetailRow
              label="Sisa"
              value={formatRupiah(Math.max(0, Number(detailDebt.amount) - Number(detailDebt.paid_amount)))}
            />
            <DetailRow label="Jatuh Tempo" value={formatDate(detailDebt.due_date)} />
            <DetailRow
              label="Status"
              value={<Badge color={debtStatusColor(detailDebt.status)}>{debtStatusLabel(detailDebt.status)}</Badge>}
            />
            <DetailRow label="Catatan" value={detailDebt.notes || '-'} />
            <DetailRow label="Dibuat" value={formatDateTime(detailDebt.created_at)} />
            <DetailRow label="Oleh" value={detailDebt.created_by_user?.profiles?.full_name || detailDebt.created_by_user?.username || '-'} />
          </div>
        )}
        {detailLoading && <p className="text-xs text-slate-400 text-center">Memuat detail...</p>}
      </Modal>

      {/* Modal: Riwayat Pembayaran (spec §9) */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Riwayat Pembayaran Hutang"
        size="lg"
        footer={<Button variant="secondary" onClick={() => setHistoryOpen(false)}>Tutup</Button>}
      >
        {historyDebt && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-1.5 text-sm">
              <DetailRow label="Pelanggan" value={historyDebt.customer?.name} />
              <DetailRow label="Total Hutang" value={formatRupiah(historyDebt.amount)} />
              <DetailRow label="Sudah Dibayar" value={<span className="font-mono text-emerald-600">{formatRupiah(historyDebt.paid_amount)}</span>} />
              <DetailRow
                label="Sisa"
                value={
                  <span className={`font-mono font-semibold ${Math.max(0, Number(historyDebt.amount) - Number(historyDebt.paid_amount)) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {formatRupiah(Math.max(0, Number(historyDebt.amount) - Number(historyDebt.paid_amount)))}
                  </span>
                }
              />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Riwayat Pembayaran</h4>
              {history.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : history.error ? (
                <ErrorState message={history.error} onRetry={() => openHistory(historyDebt)} />
              ) : !history.data?.payments?.length ? (
                <EmptyState title="Belum ada pembayaran" description="Hutang ini belum pernah dibayar" icon={Receipt} />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Tanggal</th>
                        <th className="px-4 py-2 text-left">Metode</th>
                        <th className="px-4 py-2 text-right">Jumlah</th>
                        <th className="px-4 py-2 text-left">Catatan</th>
                        <th className="px-4 py-2 text-left">Oleh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.data.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 text-xs text-slate-600">{formatDateTime(p.paid_at)}</td>
                          <td className="px-4 py-2 text-xs">{p.payment_method || 'CASH'}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-600">{formatRupiah(p.amount)}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{p.notes || '-'}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{p.created_by_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Pembatalan Hutang (spec §20) */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={saveCancel}
        loading={cancelSaving}
        title="Batalkan Hutang"
        message={
          cancelDebt
            ? `Hutang ${formatRupiah(cancelDebt.amount)} atas nama ${cancelDebt.customer?.name || '-'} akan ditandai sebagai DIBATALKAN. Tindakan ini tidak dapat dibatalkan. Alasan akan dicatat di audit log.${cancelError ? `\n\n${cancelError}` : ''}`
            : ''
        }
        confirmText="Ya, batalkan"
        cancelText="Batal"
        size="md"
      />
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-800 text-right font-medium">{value}</span>
    </div>
  );
}
