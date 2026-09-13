import { useState } from 'react';
import { inventoryApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { DataTable, SearchInput } from '../components/ui/DataTable.jsx';
import { Field, Input, Select } from '../components/ui/Form.jsx';
import { Badge } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { formatRupiah, formatDateTime } from '../utils/format.js';

const TYPE_BADGES = {
  purchase_price: 'bg-violet-100 text-violet-700',
  sale_price: 'bg-primary-100 text-primary-700',
};

const TYPE_LABELS = {
  purchase_price: 'Harga Beli',
  sale_price: 'Harga Jual',
};

const SOURCE_LABELS = {
  edit_produk: 'Edit Produk',
  pembelian: 'Pembelian',
  import: 'Import',
};

function diffBadge(value) {
  const diff = Number(value) || 0;
  if (diff > 0) return <span className="font-semibold text-emerald-600">+{formatRupiah(diff)}</span>;
  if (diff < 0) return <span className="font-semibold text-danger-600">-{formatRupiah(Math.abs(diff))}</span>;
  return <span className="text-slate-400">Rp 0</span>;
}

export default function PriceMovements() {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [priceType, setPriceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = useApi(
    () =>
      inventoryApi.priceMovements({
        search: debounced || undefined,
        price_type: priceType || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize,
      }).then((r) => r.data),
    [debounced, priceType, from, to, page, pageSize]
  );

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Pergerakan Harga" description="Pantau semua perubahan harga produk" />

      <DataTable
        storageKey="price-movements"
        columns={[
          { key: 'created_at', header: 'Waktu', hideable: false, render: (r) => formatDateTime(r.created_at) },
          { key: 'product', header: 'Produk', hideable: false, render: (r) => (
            <div>
              <p className="font-medium text-slate-800">{r.product?.name || '-'}</p>
              <p className="text-xs text-slate-400">{r.product?.sku || ''}</p>
            </div>
          )},
          { key: 'price_type', header: 'Jenis Harga', render: (r) => <Badge color={TYPE_BADGES[r.price_type]}>{TYPE_LABELS[r.price_type] || r.price_type}</Badge> },
          { key: 'old_value', header: 'Dari', align: 'right', render: (r) => formatRupiah(r.old_value) },
          { key: 'new_value', header: 'Ke', align: 'right', render: (r) => formatRupiah(r.new_value) },
          { key: 'difference', header: 'Selisih', align: 'right', render: (r) => diffBadge(r.difference) },
          { key: 'changed_by_name', header: 'Diubah Oleh', render: (r) => r.changed_by_name || '-' },
          { key: 'source', header: 'Sumber', priority: 'lg', render: (r) => SOURCE_LABELS[r.source] || r.source || '-' },
        ]}
        data={d?.items || []}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        totalPages={d?.totalPages}
        total={d?.total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        renderCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800">{r.product?.name || '-'}</p>
                <p className="text-xs text-slate-400">{formatDateTime(r.created_at)}</p>
              </div>
              <Badge color={TYPE_BADGES[r.price_type]}>{TYPE_LABELS[r.price_type] || r.price_type}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{formatRupiah(r.old_value)} → {formatRupiah(r.new_value)}</span>
              {diffBadge(r.difference)}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Oleh: {r.changed_by_name || '-'}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{SOURCE_LABELS[r.source] || r.source || '-'}</span>
            </div>
          </div>
        )}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari produk, user..." className="w-full sm:w-64" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={priceType} onChange={(e) => { setPriceType(e.target.value); setPage(1); }} className="w-full sm:w-40">
                <option value="">Semua Jenis Harga</option>
                <option value="purchase_price">Harga Beli</option>
                <option value="sale_price">Harga Jual</option>
              </Select>
              <Field label="Dari" className="w-full sm:w-40"><Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
              <Field label="Sampai" className="w-full sm:w-40"><Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
            </div>
          </>
        }
      />
    </div>
  );
}