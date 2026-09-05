import { useMemo, useState } from 'react';
import { SlidersHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { inventoryApi, categoriesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { adjustStockSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { DataTable, SearchInput } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Form.jsx';
import { Badge } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { formatQty, formatRupiah } from '../utils/format.js';

// Arah penyesuaian (bertambah / berkurang)
const DIRECTIONS = [
  { value: 'in', label: 'Stok Bertambah', icon: ArrowUp, color: 'emerald' },
  { value: 'out', label: 'Stok Berkurang', icon: ArrowDown, color: 'amber' },
];

// Kategori alasan untuk stok berkurang
const REASON_CATEGORIES = {
  in: [
    { value: 'restock', label: 'Stok fisik berbeda (lebih)' },
    { value: 'received_extra', label: 'Bonus / tambahan dari supplier' },
    { value: 'correction_in', label: 'Koreksi sistem (stok kurang tercatat)' },
    { value: 'other_in', label: 'Lainnya' },
  ],
  out: [
    { value: 'damaged', label: 'Barang rusak' },
    { value: 'expired', label: 'Kadaluarsa' },
    { value: 'lost', label: 'Hilang / tidak ditemukan' },
    { value: 'supplier_return', label: 'Retur ke supplier' },
    { value: 'correction_out', label: 'Koreksi sistem (stok lebih tercatat)' },
    { value: 'sample', label: 'Barang sampel / dipinjam' },
    { value: 'other_out', label: 'Lainnya' },
  ],
};

export default function Inventory() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [categoryId, setCategoryId] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [adjusting, setAdjusting] = useState(null);
  const [form, setForm] = useState({ direction: 'in', reason_category: 'restock', quantity: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const categories = useApi(() => categoriesApi.list({ pageSize: 1000 }).then((r) => r.data?.items || []), []);
  const list = useApi(
    () => inventoryApi.list({ search: debounced || undefined, category_id: categoryId || undefined, filter: filter || undefined, page, pageSize }).then((r) => r.data),
    [debounced, categoryId, filter, page, pageSize]
  );

  const openAdjust = (p) => {
    setAdjusting(p);
    setForm({ direction: 'in', reason_category: 'restock', quantity: '', reason: '' });
  };

  // Pilihan kategori tersedia sesuai arah yang dipilih
  const reasonOptions = REASON_CATEGORIES[form.direction];
  const categoryOption = reasonOptions.find((c) => c.value === form.reason_category) || reasonOptions[0];

  // Alasan penuh = label kategori + catatan tambahan (opsional)
  const appendNote = form.reason?.trim();
  const fullReason = appendNote ? `${categoryOption.label} — ${appendNote}` : categoryOption.label;

  // Jumlah bertanda: arah menentukan +/−
  const computedQty = form.quantity === '' || !Number.isFinite(Number(form.quantity))
    ? Number.NaN
    : (form.direction === 'out' ? -Math.abs(Number(form.quantity)) : Math.abs(Number(form.quantity)));

  const adjustValidation = useMemo(
    () => validateSchema(adjustStockSchema, { product_id: adjusting?.id, quantity: computedQty, reason: fullReason }),
    [adjusting, computedQty, fullReason]
  );

  const changeDirection = (dir) => {
    setForm((f) => ({
      ...f,
      direction: dir,
      reason_category: REASON_CATEGORIES[dir][0].value,
    }));
  };

  // Validasi lalu tampilkan dialog konfirmasi sebelum stok benar-benar diubah
  const requestAdjust = () => {
    if (!adjustValidation.isValid) {
      toast.error(Object.values(adjustValidation.errors)[0]);
      return;
    }
    setConfirming({
      product: adjusting,
      quantity: computedQty,
      reason: fullReason,
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
            <p className="text-slate-500">Stok saat ini: <b className="text-slate-800">{formatQty(adjusting?.stock)}</b> {adjusting?.unit?.short_name || adjusting?.unit?.name || ''}</p>
            <p className="mt-1 text-xs text-slate-400">
              Pilih arah perubahan lalu isi jumlah dan alasan. Perubahan tercatat di pergerakan stok.
            </p>
          </div>

          <Field label="Arah perubahan" required>
            <div className="grid grid-cols-2 gap-2">
              {DIRECTIONS.map((d) => {
                const Icon = d.icon;
                const active = form.direction === d.value;
                const activeCls = d.color === 'emerald'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/25'
                  : 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/25';
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => changeDirection(d.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                      active
                        ? activeCls
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    aria-pressed={active}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Kategori alasan" required>
            <Select
              value={form.reason_category}
              onChange={(e) => setForm((f) => ({ ...f, reason_category: e.target.value }))}
            >
              {reasonOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label={form.direction === 'out' ? 'Jumlah berkurang' : 'Jumlah bertambah'}
            required
            error={form.quantity === '' ? null : adjustValidation.errors.quantity}
          >
            <Input
              type="text"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                  setForm((f) => ({ ...f, quantity: raw }));
                }
              }}
              placeholder={form.direction === 'out' ? 'cth: 5' : 'cth: 10'}
              error={!!(form.quantity !== '' && adjustValidation.errors.quantity)}
            />
          </Field>

          <Field label="Catatan (opsional)" hint="Detail tambahan, mis. 3 pcs pecah">
            <Textarea rows={2} maxLength={500} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Tambah keterangan jika perlu" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={doAdjust}
        loading={saving}
        title="Konfirmasi penyesuaian stok?"
        message={
          confirming
            ? `${confirming.product?.name}: stok ${formatQty(confirming.product?.stock)} → ${formatQty(
                Number(confirming.product?.stock || 0) + Number(confirming.quantity || 0)
              )} (${confirming.quantity > 0 ? '+' : ''}${formatQty(Math.abs(Number(confirming.quantity)))}). Alasan: "${confirming.reason}". Perubahan tercatat di pergerakan stok.`
            : ''
        }
        confirmText="Ya, sesuaikan stok"
      />
    </div>
  );
}
