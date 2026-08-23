import { useMemo, useState } from 'react';
import { SlidersHorizontal, Boxes } from 'lucide-react';
import { inventoryApi, categoriesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { adjustStockSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Select, Button, Modal, Field, Input, Textarea, Badge, ConfirmDialog, PageHeader } from '../components/ui/index.jsx';
import { formatQty, formatRupiah } from '../utils/format.js';

export default function Inventory() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [categoryId, setCategoryId] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [adjusting, setAdjusting] = useState(null);
  const [form, setForm] = useState({ quantity: 0, reason: '' });
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const categories = useApi(() => categoriesApi.list({ pageSize: 1000 }).then((r) => r.data?.items || []), []);
  const list = useApi(
    () => inventoryApi.list({ search: debounced || undefined, category_id: categoryId || undefined, filter: filter || undefined, page, pageSize }).then((r) => r.data),
    [debounced, categoryId, filter, page, pageSize]
  );

  const openAdjust = (p) => {
    setAdjusting(p);
    setForm({ quantity: 0, reason: '' });
  };

  const adjustValidation = useMemo(
    () => validateSchema(adjustStockSchema, { product_id: adjusting?.id, ...form }),
    [adjusting, form]
  );

  // Validasi lalu tampilkan dialog konfirmasi sebelum stok benar-benar diubah
  const requestAdjust = () => {
    if (!adjustValidation.isValid) {
      toast.error(Object.values(adjustValidation.errors)[0]);
      return;
    }
    setConfirming({
      product: adjusting,
      quantity: Number(form.quantity),
      reason: form.reason.trim(),
    });
  };

  const doAdjust = async () => {
    setSaving(true);
    try {
      await inventoryApi.adjust({ product_id: confirming.product.id, quantity: confirming.quantity, reason: confirming.reason });
      toast.success('Stok berhasil disesuaikan');
      setAdjusting(null);
      setConfirming(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyesuaikan stok'));
    } finally {
      setSaving(false);
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Stok" description="Pantau dan kelola stok produk" />

      <DataTable
        storageKey="inventory"
        columns={[
          { key: 'product', header: 'Produk', render: (r) => (
            <div>
              <p className="font-medium text-slate-800">{r.name}</p>
              <p className="text-xs text-slate-400">{r.sku}</p>
            </div>
          )},
          { key: 'category', header: 'Kategori', render: (r) => r.category?.name || '-' },
          { key: 'stock', header: 'Stok', render: (r) => (
            <span className={`font-semibold ${r.is_out ? 'text-red-600' : r.is_low ? 'text-amber-600' : 'text-slate-800'}`}>
              {formatQty(r.stock)}
            </span>
          )},
          { key: 'min_stock', header: 'Min', render: (r) => formatQty(r.min_stock) },
          { key: 'status', header: 'Kondisi', render: (r) => r.is_out
            ? <Badge color="bg-red-100 text-red-700">Habis</Badge>
            : r.is_low ? <Badge color="bg-amber-100 text-amber-700">Menipis</Badge>
            : <Badge color="bg-emerald-100 text-emerald-700">Aman</Badge> },
          { key: 'hpp', header: 'HPP', render: (r) => formatRupiah(r.purchase_price) },
          { key: 'actions', header: 'Aksi', render: (r) => can('inventory.adjust') && (
            <Button size="xs" variant="outline" onClick={() => openAdjust(r)}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Sesuaikan
            </Button>
          )},
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
          <div className="space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-400">{r.sku} · {r.category?.name || '-'}</p>
              </div>
              {r.is_out
                ? <Badge color="bg-red-100 text-red-700">Habis</Badge>
                : r.is_low ? <Badge color="bg-amber-100 text-amber-700">Menipis</Badge>
                : <Badge color="bg-emerald-100 text-emerald-700">Aman</Badge>}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Stok: <b className={r.is_out ? 'text-red-600' : r.is_low ? 'text-amber-600' : 'text-slate-800'}>{formatQty(r.stock)}</b></span>
              <span>Min: {formatQty(r.min_stock)}</span>
              <span>HPP: {formatRupiah(r.purchase_price)}</span>
            </div>
            {can('inventory.adjust') && (
              <div className="flex justify-end">
                <button onClick={(e) => { e.stopPropagation(); openAdjust(r); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                  Sesuaikan Stok
                </button>
              </div>
            )}
          </div>
        )}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari produk..." className="w-full sm:w-64" />
            <div className="flex flex-wrap gap-2">
              <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-full sm:w-40">
                <option value="">Semua Kategori</option>
                {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="w-full sm:w-36">
                <option value="">Semua Stok</option>
                <option value="low">Stok Menipis</option>
                <option value="out">Stok Habis</option>
              </Select>
            </div>
          </>
        }
      />

      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={`Sesuaikan Stok — ${adjusting?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>Batal</Button>
            <Button onClick={requestAdjust} disabled={!adjustValidation.isValid}>Simpan Penyesuaian</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Stok saat ini: <b className="text-slate-800">{formatQty(adjusting?.stock)}</b> {adjusting?.unit?.short_name}</p>
            <p className="mt-1 text-xs text-slate-400">
              Masukkan angka <b>positif</b> untuk menambah stok, <b>negatif</b> untuk mengurangi. Perubahan tercatat di pergerakan stok.
            </p>
          </div>
          <Field label="Jumlah penyesuaian" required error={adjustValidation.errors.quantity}>
            <Input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="cth: 10 atau -5" error={!!adjustValidation.errors.quantity} />
          </Field>
          <Field label="Alasan" required error={adjustValidation.errors.reason} hint="Minimal 3 karakter">
            <Textarea rows={2} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="cth: barang rusak / stok fisik berbeda" error={!!adjustValidation.errors.reason} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={doAdjust}
        loading={saving}
        title="Konfirmasi penyesuaian stok?"
        message={`${confirming?.product?.name}: stok ${formatQty(confirming?.product?.stock)} → ${formatQty(Number(confirming?.product?.stock || 0) + Number(confirming?.quantity || 0))} (${confirming?.quantity > 0 ? '+' : ''}${formatQty(confirming?.quantity)}). Alasan: "${confirming?.reason}". Perubahan tercatat di pergerakan stok.`}
        confirmText="Ya, sesuaikan stok"
      />
    </div>
  );
}
