import { useEffect, useMemo, useState } from 'react';
import { HandCoins, RefreshCw, Plus, Users, Wallet, PiggyBank, CheckCircle2, Clock } from 'lucide-react';
import { profitApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  Card, Button, StatCard, Select, Input, Field, Textarea, Modal, ConfirmDialog,
  SkeletonRows, EmptyState, ErrorState, Badge, Spinner, PageHeader, Pagination,
} from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime } from '../utils/format.js';

export default function ProfitSharing() {
  const { can } = usePermission();
  const [periods, setPeriods] = useState([]);
  const [year, setYear] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [distributing, setDistributing] = useState(null); // share row yang sedang dibagikan
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmDistribute, setConfirmDistribute] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [sharesPage, setSharesPage] = useState(1);
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
        .shares({ year: year || undefined, status: statusFilter || undefined })
        .then((r) => r.data),
    [year, statusFilter, refreshKey]
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

  const doDistribute = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    if (amt > distributing.remaining + 0.001) {
      toast.error('Nominal melebihi sisa hak bagi hasil');
      return;
    }
    setSubmitting(true);
    try {
      await profitApi.distribute({
        period_id: distributing.period_id,
        customer_id: distributing.customer_id,
        amount: amt,
        note: note || null,
      });
      toast.success(`Bagi hasil ${formatRupiah(amt)} berhasil dibagikan`);
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
            ) : (() => {
              const allItems = shares.data.items;
              const sharesPageSize = 20;
              const sharesTotalPages = Math.ceil(allItems.length / sharesPageSize) || 1;
              const sharesFrom = (sharesPage - 1) * sharesPageSize;
              const pageItems = allItems.slice(sharesFrom, sharesFrom + sharesPageSize);
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                          <th className="px-4 py-2.5 font-semibold">Pelanggan</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Total Pembelian</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Total Laba</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Hak 2,5%</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Dibagikan</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Sisa</th>
                          <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                          {can('profit.distribute') && <th className="px-4 py-2.5 text-right font-semibold">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pageItems.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{s.customer?.name || '-'}</p>
                          <p className="text-xs text-slate-400">{s.customer?.phone || ''}</p>
                        </td>
                        <td className="px-4 py-3 text-right">{formatRupiah(s.total_purchase)}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatRupiah(s.total_profit)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-violet-700">{formatRupiah(s.share_amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatRupiah(s.distributed)}</td>
                        <td className="px-4 py-3 text-right">
                          {s.remaining > 0 ? (
                            <span className="font-medium text-amber-600">{formatRupiah(s.remaining)}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.status === 'paid' ? (
                            <Badge color="bg-emerald-100 text-emerald-700">Sudah Dibagikan</Badge>
                          ) : (
                            <Badge color="bg-amber-100 text-amber-700">Belum Dibagikan</Badge>
                          )}
                        </td>
                        {can('profit.distribute') && (
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="outline" disabled={s.remaining <= 0} onClick={() => openDistribute(s)}>
                              <HandCoins className="h-3.5 w-3.5" /> Bagikan
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sharesTotalPages > 1 && (
                <div className="border-t border-slate-200">
                  <Pagination page={sharesPage} totalPages={sharesTotalPages} total={allItems.length} pageSize={sharesPageSize} onPageChange={setSharesPage} />
                </div>
              )}
                </>
              );
            })()}
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
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                          <th className="px-4 py-2.5 font-semibold">Tanggal</th>
                          <th className="px-4 py-2.5 font-semibold">Pelanggan</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Jumlah</th>
                          <th className="px-4 py-2.5 font-semibold">Diproses Oleh</th>
                          <th className="px-4 py-2.5 font-semibold">Catatan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {distributions.data.items.map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">{formatDateTime(d.distributed_at)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{d.customer?.name || '-'}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatRupiah(d.amount)}</td>
                            <td className="px-4 py-3">
                              {d.distributor?.profiles?.full_name || d.distributor?.username || '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{d.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {distributions.data?.totalPages > 1 && (
                  <div className="border-t border-slate-200">
                    <Pagination page={distributionsPage} totalPages={distributions.data.totalPages} total={distributions.data.total} pageSize={distributions.data.pageSize} onPageChange={setDistributionsPage} />
                  </div>
                )}
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
            <Button variant="primary" icon={HandCoins} onClick={() => setConfirmDistribute(true)}>
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
            <Field label="Jumlah Dibagikan (Rp)" required>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Catatan">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="cth: dibagikan tunai saat kunjungan pelanggan" />
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
