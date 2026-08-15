import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Printer } from 'lucide-react';
import { salesApi, settingsApi, usersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { DataTable, SearchInput, Select, Field, Input, StatusBadge } from '../components/ui/index.jsx';
import { formatRupiah, formatDateTime, paymentMethodLabel, paymentMethodColor } from '../utils/format.js';
import ReceiptModal from '../components/pos/ReceiptModal.jsx';

export default function Sales() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [cashierId, setCashierId] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'created_at', order: 'desc' });
  const [receiptSale, setReceiptSale] = useState(null);
  const [settings, setSettings] = useState({});

  // Dropdown kasir hanya dimuat bila user punya izin melihat daftar user
  const users = useApi(
    () => (can('users.view') ? usersApi.list({ pageSize: 100 }).then((r) => r.data) : Promise.resolve({ items: [] })),
    []
  );
  const list = useApi(
    () =>
      salesApi.list({
        search: debounced || undefined,
        cashier_id: cashierId || undefined,
        payment_method: method || undefined,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 20,
        sort: sort.key,
        order: sort.order,
      }).then((r) => r.data),
    [debounced, cashierId, method, status, from, to, page, sort]
  );

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'desc' }));
    setPage(1);
  };

  const printReceipt = async (sale) => {
    try {
      const [saleRes, settingsRes] = await Promise.all([salesApi.get(sale.id), settingsApi.get()]);
      setSettings(settingsRes.data);
      setReceiptSale(saleRes.data);
    } catch {
      toast.error('Gagal memuat data struk');
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Riwayat Penjualan</h1>
        <p className="text-sm text-slate-500">Semua transaksi penjualan toko</p>
      </div>

      <DataTable
        columns={[
          { key: 'invoice_number', header: 'No. Transaksi', sortable: true, render: (r) => <span className="font-medium text-indigo-600">{r.invoice_number}</span> },
          { key: 'created_at', header: 'Tanggal', sortable: true, render: (r) => formatDateTime(r.created_at) },
          { key: 'cashier', header: 'Kasir', render: (r) => r.cashier?.profiles?.full_name || r.cashier?.username || '-' },
          { key: 'customer', header: 'Pelanggan', render: (r) => r.customer?.name || '-' },
          { key: 'payment_method', header: 'Metode', render: (r) => (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentMethodColor(r.payment_method)}`}>
              {paymentMethodLabel(r.payment_method)}
            </span>
          )},
          { key: 'total', header: 'Total', sortable: true, render: (r) => <span className="font-semibold">{formatRupiah(r.total)}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              {can('sales.view') && (
                <button onClick={() => navigate(`/sales/${r.id}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600">
                  <Eye className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => printReceipt(r)} title="Cetak ulang struk" className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                <Printer className="h-4 w-4" />
              </button>
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
        sort={sort}
        onSortChange={handleSort}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari no. transaksi..." className="w-full sm:w-56" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={cashierId} onChange={(e) => { setCashierId(e.target.value); setPage(1); }} className="w-40">
                <option value="">Semua Kasir</option>
                {(users.data?.items || []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </Select>
              <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="w-36">
                <option value="">Semua Metode</option>
                {['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'].map((m) => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
              </Select>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
                <option value="">Semua Status</option>
                <option value="completed">Selesai</option>
                <option value="partially_refunded">Retur Sebagian</option>
                <option value="refunded">Diretur</option>
                <option value="cancelled">Dibatalkan</option>
              </Select>
              <Field className="w-36"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
              <Field className="w-36"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
            </div>
          </>
        }
      />

      <ReceiptModal open={!!receiptSale} onClose={() => setReceiptSale(null)} sale={receiptSale} settings={settings} />
    </div>
  );
}
