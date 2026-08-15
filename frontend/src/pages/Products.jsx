import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { productsApi, categoriesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Select, Button, StatusBadge, ConfirmDialog, Card } from '../components/ui/index.jsx';
import { formatRupiah, formatQty } from '../utils/format.js';

export default function Products() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'name', order: 'asc' });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' }));
    setPage(1);
  };

  const params = {
    search: debounced || undefined,
    category_id: categoryId || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
    sort: sort.key,
    order: sort.order,
  };

  const products = useApi(() => productsApi.list(params).then((r) => r.data), [debounced, categoryId, status, page, sort]);
  const categories = useApi(() => categoriesApi.list().then((r) => r.data), []);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await productsApi.remove(toDelete.id);
      toast.success('Produk berhasil dihapus');
      setToDelete(null);
      products.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus produk'));
    } finally {
      setDeleting(false);
    }
  };

  const d = products.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Produk</h1>
          <p className="text-sm text-slate-500">Kelola produk toko</p>
        </div>
        {can('products.create') && (
          <Button icon={Plus} onClick={() => navigate('/products/new')}>
            Tambah Produk
          </Button>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'name', header: 'Produk', sortable: true, render: (r) => (
            <div>
              <p className="font-medium text-slate-800">{r.name}</p>
              <p className="text-xs text-slate-400">SKU: {r.sku} · Barcode: {r.barcode || '-'}</p>
            </div>
          )},
          { key: 'category', header: 'Kategori', render: (r) => r.category?.name || '-' },
          { key: 'unit', header: 'Satuan', render: (r) => r.unit?.short_name || '-' },
          { key: 'purchase_price', header: 'Harga Beli', sortable: true, render: (r) => formatRupiah(r.purchase_price) },
          { key: 'sale_price', header: 'Harga Jual', sortable: true, render: (r) => <span className="font-semibold">{formatRupiah(r.sale_price)}</span> },
          { key: 'stock', header: 'Stok', sortable: true, render: (r) => (
            <span className={Number(r.stock) <= Number(r.min_stock) ? 'font-semibold text-red-600' : ''}>
              {formatQty(r.stock)}
            </span>
          )},
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              {can('products.update') && (
                <button onClick={() => navigate(`/products/${r.id}/edit`)} className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {can('products.delete') && (
                <button onClick={() => setToDelete(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )},
        ]}
        data={d?.items || []}
        loading={products.loading}
        error={products.error}
        onRetry={products.reload}
        page={page}
        totalPages={d?.totalPages}
        total={d?.total}
        pageSize={d?.pageSize}
        onPageChange={setPage}
        sort={sort}
        onSortChange={handleSort}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nama, SKU, barcode..." className="w-full sm:w-72" />
            <div className="flex gap-2">
              <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-44">
                <option value="">Semua Kategori</option>
                {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36">
                <option value="">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </Select>
            </div>
          </>
        }
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Hapus produk ini?"
        message={`"${toDelete?.name}" akan dihapus permanen.`}
        confirmText="Ya, hapus"
      />
    </div>
  );
}
