import { useState } from 'react';
import { inventoryApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { DataTable, SearchInput, Select, Badge, Field, Input } from '../components/ui/index.jsx';
import { formatQty, formatDateTime, formatNumber } from '../utils/format.js';

const TYPE_BADGES = {
  STOCK_IN: 'bg-emerald-100 text-emerald-700',
  STOCK_OUT: 'bg-red-100 text-red-700',
  SALE: 'bg-primary-100 text-primary-700',
  SALE_RETURN: 'bg-sky-100 text-sky-700',
  PURCHASE: 'bg-violet-100 text-violet-700',
  ADJUSTMENT: 'bg-amber-100 text-amber-700',
  STOCK_OPNAME: 'bg-slate-100 text-slate-700',
};

const TYPE_LABELS = {
  STOCK_IN: 'Stok Masuk',
  STOCK_OUT: 'Stok Keluar',
  SALE: 'Penjualan',
  SALE_RETURN: 'Retur Penjualan',
  PURCHASE: 'Pembelian',
  ADJUSTMENT: 'Penyesuaian',
  STOCK_OPNAME: 'Stock Opname',
};

export default function Movements() {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const list = useApi(
    () =>
      inventoryApi.movements({
        search: debounced || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 20,
      }).then((r) => r.data),
    [debounced, type, from, to, page]
  );

  const d = list.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pergerakan Stok</h1>
        <p className="text-sm text-slate-500">Riwayat semua perubahan stok produk</p>
      </div>

      <DataTable
        columns={[
          { key: 'created_at', header: 'Waktu', render: (r) => formatDateTime(r.created_at) },
          { key: 'product', header: 'Produk', render: (r) => (
            <div>
              <p className="font-medium text-slate-800">{r.product?.name || '-'}</p>
              <p className="text-xs text-slate-400">{r.product?.sku || ''}</p>
            </div>
          )},
          { key: 'type', header: 'Jenis', render: (r) => <Badge color={TYPE_BADGES[r.type]}>{TYPE_LABELS[r.type] || r.type}</Badge> },
          { key: 'quantity', header: 'Qty', render: (r) => (
            <span className={`font-semibold ${Number(r.quantity) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {Number(r.quantity) >= 0 ? '+' : ''}{formatNumber(r.quantity)}
            </span>
          )},
          { key: 'stock', header: 'Stok (sebelum → sesudah)', render: (r) => `${formatQty(r.before_stock)} → ${formatQty(r.after_stock)}` },
          { key: 'notes', header: 'Catatan', render: (r) => <span className="line-clamp-1 max-w-48">{r.notes || '-'}</span> },
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
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari produk..." className="w-full sm:w-60" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-44">
                <option value="">Semua Jenis</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <Field className="w-40"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
              <Field className="w-40"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
            </div>
          </>
        }
      />
    </div>
  );
}
