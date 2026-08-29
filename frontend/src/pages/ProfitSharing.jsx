import { useEffect, useMemo, useState } from 'react';
import { HandCoins, RefreshCw, Plus, Users, Wallet, PiggyBank, CheckCircle2, Clock } from 'lucide-react';import { profitApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  Card, Button, StatCard, Select, Input, Field, Textarea, Modal, ConfirmDialog,
  SkeletonRows, EmptyState, ErrorState, Badge, Spinner, PageHeader, Pagination, DataTable,
} from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime } from '../utils/format.js';

export default function ProfitSharing() {
  const { can } = usePermission();
  const [periods, setPeriods] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState('');
  const [distributing, setDistributing] = useState(null); // share row yang sedang dibagikan
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmDistribute, setConfirmDistribute] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [sharesPage, setSharesPage] = useState(1);
  const [sharesPageSize, setSharesPageSize] = useState(25);
  const [distributionsPage, setDistributionsPage] = useState(1);

  const loadPeriods = async () => {
    setPeriodsLoading(true);
    try {
      const res = await profitApi.periods();
      setPeriods(res.data || []);
      if (!year && res.data?.length) setYear(String(res.data[0].year));
    } catch {
      toast.error('Gagal memuat periode bagi hasil');
    } finally {
      setPeriodsLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const shares = useApi(
    () =>
      profitApi
        .shares({ year: year || undefined, status: statusFilter || undefined, page: sharesPage, pageSize: sharesPageSize })
        .then((r) => r.data),
    [year, statusFilter, refreshKey, sharesPage, sharesPageSize]
  );

  const distributions = useApi(
    () => profitApi.distributions({ year: year || undefined, page: distributionsPage, pageSize: 20 }).then((r) => r.data),
    [year, refreshKey, distributionsPage]
  );

  const currentPeriod = periods.find((p) => String(p.year) === year);
  const totals = shares.data?.totals;

  const openDistribute = (share) => {
    setDistributing(share);
    setAmount(share.remaining > 0 ? String(share.remaining) : '');
    setNote('');
  };

  const amountNum = Number(amount);
  const distributeErrors = {
    amount:
      amount === '' || !Number.isFinite(amountNum)
        ? 'Nominal wajib diisi'
        : amountNum <= 0
          ? 'Nominal harus lebih dari 0'
          : distributing && amountNum > distributing.remaining + 0.001
            ? 'Nominal melebihi sisa hak bagi hasil'
            : '',
  };
  const distributeValid = !distributeErrors.amount;

  const doDistribute = async () => {
    if (!distributeValid) {
      toast.error(distributeErrors.amount);
      return;
    }
    setSubmitting(true);
    try {
      await profitApi.distribute({
        period_id: distributing.period_id,
        customer_id: distributing.customer_id,
        amount: amountNum,
        note: note || null,
      });
      toast.success(`Bagi hasil ${formatRupiah(amountNum)} berhasil dibagikan`);
      setConfirmDistribute(false);
      setDistributing(null);
      setAmount('');
      setNote('');
      setRefreshKey((k) => k + 1);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal membagikan'));
    } finally {
      setSubmitting(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      { label: 'Total Pelanggan', value: totals?.customers ?? 0, icon: Users, color: 'bg-primary-50 text-primary-600' },
      { label: 'Total Pembelian', value: formatRupiah(totals?.total_purchase), icon: Wallet, color: 'bg-sky-50 text-sky-600' },
      { label: 'Total Laba Pelanggan', value: formatRupiah(totals?.total_profit), icon: PiggyBank, color: 'bg-emerald-50 text-emerald-600' },
      { label: 'Hak 2,5%', value: formatRupiah(totals?.share), icon: HandCoins, color: 'bg-violet-50 text-violet-600' },
      { label: 'Sudah Dibagikan', value: formatRupiah(totals?.distributed), icon: CheckCircle2, color: 'bg-teal-50 text-teal-600' },
      { label: 'Sisa', value: formatRupiah(totals?.remaining), icon: Clock, color: 'bg-amber-50 text-amber-600' },
    ],
    [totals]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bagi Hasil Pelanggan 2,5%"
        description={
          <>Nilai 2,5% dihitung dari <span className="font-medium">total laba pelanggan</span> (bukan omzet), per periode tahunan.</>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {can('profit.distribute') && (
              <Button
                variant="outline"
                size="sm"
                icon={Plus}
                onClick={async () => {
                  const yr = window.prompt('Buat periode tahun (cth: 2027):', String(new Date().getFullYear() + 1));
                  if (!yr) return;
                  try {
                    await profitApi.createPeriod(Number(yr));
                    toast.success(`Periode ${yr} dibuat`);
                    setYear(yr.trim());
                    setRefreshKey((k) => k + 1);
                  } catch (error) {
                    toast.error(getErrorMessage(error, 'Gagal membuat periode'));
                  }
                }}
              >
                Periode Baru
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)}>
              Muat Ulang
            </Button>
          </div>
        }
      />

      {periodsLoading ? (
        <SkeletonRows rows={3} cols={4} />
      ) : periods.length === 0 ? (
        <EmptyState title="Belum ada periode bagi hasil" description="Periode dibuat otomatis saat ada penjualan ke pelanggan terdaftar" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-44">
              <Select value={year} onChange={(e) => { setYear(e.target.value); setSharesPage(1); setDistributionsPage(1); }}>
                {periods.map((p) => (
                  <option key={p.id} value={String(p.year)}>
                    Tahun {p.year} ({p.start_date?.slice(0, 4)} — {p.status})
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSharesPage(1); }}>
                <option value="">Semua status</option>
                <option value="unpaid">Belum Dibagikan</option>
                <option value="paid">Sudah Dibagikan</option>
              </Select>
            </div>
            {currentPeriod && (
              <span className="text-xs text-slate-500">
                Periode: {currentPeriod.start_date} — {currentPeriod.end_date}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} />
            ))}
          </div>

          <Card title={`Hak Pelanggan — Tahun ${year}`} bodyClassName="p-0">
            {shares.loading ? (
              <SkeletonRows rows={5} cols={5} />
            ) : shares.error ? (
              <ErrorState onRetry={shares.reload} />
            ) : !shares.data?.items?.length ? (
              <EmptyState title="Belum ada data" description="Penjualan ke pelanggan terdaftar akan otomatis masuk di sini" />
            ) : (
              <DataTable
                columns={[
                  { key: 'customer', headerLabel: 'Pelanggan', render: (row) => (
                    <>
                      <p className="font-medium text-slate-800">{row.customer?.name || '-'}</p>
                      <p className="text-xs text-slate-400">{row.customer?.phone || ''}</p>
                    </>
                  )},
                  { key: 'total_purchase', headerLabel: 'Total Pembelian', align: 'right', render: (row) => formatRupiah(row.total_purchase) },
                  { key: 'total_profit', headerLabel: 'Total Laba', align: 'right', render: (row) => (
                    <span className="font-medium text-emerald-600">{formatRupiah(row.total_profit)}</span>
                  )},
                  { key: 'share_amount', headerLabel: 'Hak 2,5%', align: 'right', render: (row) => (
                    <span className="font-semibold text-violet-700">{formatRupiah(row.share_amount)}</span>
                  )},
                  { key: 'distributed', headerLabel: 'Dibagikan', align: 'right', render: (row) => formatRupiah(row.distributed) },
                  { key: 'remaining', headerLabel: 'Sisa', align: 'right', render: (row) => (
                    row.remaining > 0 ? (
                      <span className="font-medium text-amber-600">{formatRupiah(row.remaining)}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )
                  )},
                  { key: 'status', headerLabel: 'Status', align: 'center', render: (row) => (
                    row.status === 'paid' ? (
                      <Badge color="bg-emerald-100 text-emerald-700">Sudah Dibagikan</Badge>
                    ) : (
                      <Badge color="bg-amber-100 text-amber-700">Belum Dibagikan</Badge>
                    )
                  )},
                  ...(can('profit.distribute') ? [{
                    key: 'action',
                    headerLabel: 'Aksi',
                    align: 'right',
                    hideable: false,
                    render: (row) => (
                      <Button size="sm" variant="outline" disabled={row.remaining <= 0} onClick={() => openDistribute(row)}>
                        <HandCoins className="h-3.5 w-3.5" /> Bagikan
                      </Button>
                    )
                  }] : [])
                ]}
                data={shares.data.items || []}
                loading={shares.loading}
                page={sharesPage}
                totalPages={shares.data.totalPages || 1}
                total={shares.data.total || 0}
                pageSize={sharesPageSize}
                onPageChange={setSharesPage}
                onPageSizeChange={(size) => { setSharesPageSize(size); setSharesPage(1); }}
                className="w-full"
              />
            )}
          </Card>

          <Card title="Riwayat Pembagian" bodyClassName="p-0">
            {distributions.loading ? (
              <SkeletonRows rows={3} cols={4} />
            ) : distributions.error ? (
              <ErrorState onRetry={distributions.reload} />
            ) : (
              <>
                {!distributions.data?.items?.length ? (
                  <EmptyState title="Belum ada pembagian" />
                ) : (
                  <DataTable
                    columns={[
                      { key: 'distributed_at', headerLabel: 'Tanggal', render: (row) => formatDateTime(row.distributed_at) },
                      { key: 'customer', headerLabel: 'Pelanggan', render: (row) => (
                        <span className="font-medium text-slate-800">{row.customer?.name || '-'}</span>
                      )},
                      { key: 'amount', headerLabel: 'Jumlah', align: 'right', render: (row) => (
                        <span className="font-semibold text-emerald-600">{formatRupiah(row.amount)}</span>
                      )},
                      { key: 'distributor', headerLabel: 'Diproses Oleh', render: (row) =>
                        row.distributor?.profiles?.full_name || row.distributor?.username || '-'
                      },
                      { key: 'note', headerLabel: 'Catatan', render: (row) => <span className="text-slate-500">{row.note || '-'}</span> }
                    ]}
                    data={distributions.data.items || []}
                    page={distributionsPage}
                    totalPages={distributions.data?.totalPages || 1}
                    total={distributions.data?.total || 0}
                    pageSize={distributions.data?.pageSize || 20}
                    onPageChange={setDistributionsPage}
                    className="w-full"
                  />
                )}
                <div className="border-t border-slate-200">
                  <Pagination page={distributionsPage} totalPages={distributions.data?.totalPages || 1} total={distributions.data?.total || 0} pageSize={distributions.data?.pageSize || 20} onPageChange={setDistributionsPage} />
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* Modal pembagian */}
      <Modal
        open={Boolean(distributing)}
        onClose={() => setDistributing(null)}
        title={`Bagikan Hak — ${distributing?.customer?.name || ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDistributing(null)}>Batal</Button>
            <Button variant="primary" icon={HandCoins} onClick={() => setConfirmDistribute(true)} disabled={!distributeValid}>
              Simpan
            </Button>
          </>
        }
      >
        {distributing && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Hak 2,5%</span><span className="font-semibold text-violet-700">{formatRupiah(distributing.share_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sudah dibagikan</span><span>{formatRupiah(distributing.distributed)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-500">Sisa</span><span className="font-semibold text-amber-600">{formatRupiah(distributing.remaining)}</span></div>
            </div>
            <Field label="Jumlah Dibagikan (Rp)" required error={distributeErrors.amount}>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" error={!!distributeErrors.amount} />
            </Field>
            <Field label="Catatan">
              <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="cth: dibagikan tunai saat kunjungan pelanggan (opsional)" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDistribute}
        onClose={() => setConfirmDistribute(false)}
        onConfirm={doDistribute}
        loading={submitting}
        title="Konfirmasi pembagian?"
        message={`Bagikan ${formatRupiah(Number(amount) || 0)} ke ${distributing?.customer?.name || '-'}? Riwayat pembagian akan tersimpan dan tidak dihapus.`}
        confirmText="Ya, bagikan"
      />
    </div>
  );
}
