import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Tags, Layers } from 'lucide-react';
import { productsApi, categoriesApi, unitsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { DataTable, SearchInput } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { Field, Input, Select } from '../components/ui/Form.jsx';
import { StatusBadge } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { formatRupiah, formatQty } from '../utils/format.js';

export default function Products() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: 'name', order: 'asc' });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [catSaving, setCatSaving] = useState(false);

  const [unitModal, setUnitModal] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: '', short_name: '' });
  const [unitSaving, setUnitSaving] = useState(false);

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' }));
    setPage(1);
  };

  const params = {
    search: debounced || undefined,
    category_id: categoryId || undefined,
    status: status || undefined,
    page,
    pageSize,
    sort: sort.key,
    order: sort.order,
  };

  const products = useApi(() => productsApi.list(params).then((r) => r.data), [debounced, categoryId, status, page, pageSize, sort]);
  const categories = useApi(() => categoriesApi.list({ pageSize: 1000 }).then((r) => r.data?.items || []), []);
  const units = useApi(() => unitsApi.list().then((r) => r.data), []);

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

  const saveCategory = async () => {
    if (!catForm.name.trim()) {
      toast.error('Nama kategori wajib diisi');
      return;
    }
    setCatSaving(true);
    try {
      await categoriesApi.create(catForm);
      toast.success('Kategori berhasil dibuat');
      setCatModal(false);
      setCatForm({ name: '', description: '' });
      categories.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal membuat kategori'));
    } finally {
      setCatSaving(false);
    }
  };

  const saveUnit = async () => {
    if (!unitForm.name.trim() || !unitForm.short_name.trim()) {
      toast.error('Nama dan singkatan satuan wajib diisi');
      return;
    }
    setUnitSaving(true);
    try {
      await unitsApi.create(unitForm);
      toast.success('Satuan berhasil dibuat');
      setUnitModal(false);
      setUnitForm({ name: '', short_name: '' });
      units.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal membuat satuan'));
    } finally {
      setUnitSaving(false);
    }
  };

  const d = products.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produk"
        description="Kelola produk toko"
        actions={can('products.create') && (
          <Button icon={Plus} onClick={() => navigate('/products/new')}>
            Tambah Produk
          </Button>
        )}
      />

      <DataTable
        storageKey="products"
        columns={[
          { key: 'name', header: 'Produk', sortable: true, hideable: false, render: (r) => (
            <div className="flex items-center gap-3">
              <ProductImage src={r.image_url} alt={r.name} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-400">SKU: {r.sku} · Barcode: {r.barcode || '-'}</p>
              </div>
            </div>
          )},
          { key: 'category', header: 'Kategori', priority: 'md', render: (r) => r.category?.name || '-' },
          { key: 'unit', header: 'Satuan', priority: 'lg', render: (r) => r.unit?.short_name || '-' },
          { key: 'purchase_price', header: 'Harga Beli', align: 'right', sortable: true, priority: 'lg', render: (r) => formatRupiah(r.purchase_price) },
          { key: 'sale_price', header: 'Harga Jual', align: 'right', sortable: true, render: (r) => <span className="font-semibold">{formatRupiah(r.sale_price)}</span> },
          { key: 'stock', header: 'Stok', align: 'right', sortable: true, render: (r) => (
            <span className={Number(r.stock) <= Number(r.min_stock) ? 'font-semibold text-red-600' : ''}>
              {formatQty(r.stock)}
            </span>
          )},
          { key: 'status', header: 'Status', priority: 'md', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: 'Aksi', align: 'right', hideable: false, render: (r) => (
            <div className="flex gap-1">
              {can('products.update') && (
                <button onClick={() => navigate(`/products/${r.id}/edit`)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        sort={sort}
        onSortChange={handleSort}
        renderCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start gap-3">
              <ProductImage src={r.image_url} alt={r.name} className="h-12 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 truncate">{r.name}</p>
                <p className="text-xs text-slate-400">SKU: {r.sku}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {r.category?.name && <span>{r.category.name}</span>}
              {r.unit?.short_name && <span>{r.unit.short_name}</span>}
              <span>Stok: <b className={Number(r.stock) <= Number(r.min_stock) ? 'text-red-600' : 'text-slate-800'}>{formatQty(r.stock)}</b></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{formatRupiah(r.sale_price)}</span>
              <div className="flex gap-1">
                {can('products.update') && (
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/products/${r.id}/edit`); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                    Edit
                  </button>
                )}
                {can('products.delete') && (
                  <button onClick={(e) => { e.stopPropagation(); setToDelete(r); }} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">
                    Hapus
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nama, SKU, barcode..." className="w-full sm:w-72" />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-full sm:w-44">
                  <option value="">Semua Kategori</option>
                  {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                {can('categories.create') && (
                  <button onClick={() => setCatModal(true)} title="Tambah kategori" className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors">
                    <Tags className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full sm:w-36">
                  <option value="">Semua Status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </Select>
              </div>
              {can('products.create') && (
                <button onClick={() => setUnitModal(true)} title="Tambah satuan" className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors">
                  <Layers className="h-4 w-4" />
                </button>
              )}
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

      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title="Tambah Kategori"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatModal(false)}>Batal</Button>
            <Button onClick={saveCategory} loading={catSaving}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Kategori" required>
            <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="cth: Makanan" autoFocus />
          </Field>
          <Field label="Deskripsi">
            <Input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} placeholder="Deskripsi singkat (opsional)" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={unitModal}
        onClose={() => setUnitModal(false)}
        title="Tambah Satuan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnitModal(false)}>Batal</Button>
            <Button onClick={saveUnit} loading={unitSaving}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Satuan" required>
            <Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="cth: Kilogram" autoFocus />
          </Field>
          <Field label="Singkatan" required hint="Singkatan yang ditampilkan di tabel">
            <Input value={unitForm.short_name} onChange={(e) => setUnitForm({ ...unitForm, short_name: e.target.value })} placeholder="cth: Kg" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
