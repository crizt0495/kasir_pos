import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, ClipboardCheck, TrendingUp, Plus, Trash2, Barcode, X as XIcon } from 'lucide-react';
import { inventoryApi, productsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Card, Input, SearchInput, ConfirmDialog, Badge, Skeleton } from '../components/ui/index.jsx';
import { formatDateTime, formatQty } from '../utils/format.js';

export default function OpnameForm() {
  const { id } = useParams();
  const isView = Boolean(id);
  const isNew = !id;
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [opnameDate] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isView);
  const [existing, setExisting] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const products = useApi(
    () => productsApi.list({ search: debounced || undefined, pageSize: 50, sort: 'name' }).then((r) => r.data),
    [debounced]
  );

  useEffect(() => {
    if (!isView) return;
    let cancelled = false;
    inventoryApi
      .opname(id)
      .then((res) => {
        if (cancelled) return;
        setExisting(res.data);
        setNotes(res.data.notes || '');
        setItems(
          res.data.items.map((i) => ({
            product_id: i.product_id,
            product: i.product,
            system_stock: i.system_stock,
            physical_stock: i.physical_stock,
            reason: i.reason || '',
            status: i.status || 'pending',
          }))
        );
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isView]);

  const addProduct = (product) => {
    if (items.some((i) => i.product_id === product.id)) {
      toast.info('Produk sudah ditambahkan');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product,
        system_stock: Number(product.stock),
        physical_stock: Number(product.stock),
        reason: '',
        status: 'pending',
      },
    ]);
  };

  const updateItem = (productId, patch) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.product_id !== productId) return i;
        const updated = { ...i, ...patch };
        const diff = Number(updated.physical_stock) - Number(updated.system_stock);
        updated.status = diff !== 0 ? 'mismatch' : (i.status !== 'pending' ? 'completed' : 'pending');
        return updated;
      })
    );
  };

  const removeItem = (productId) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const handleScan = async () => {
    try {
      const code = prompt('Masukkan kode barcode:');
      if (!code) return;
      const { data } = await productsApi.list({ search: code, pageSize: 1 });
      if (data.items?.length > 0) {
        addProduct(data.items[0]);
        toast.success(`Ditemukan: ${data.items[0].name}`);
      } else {
        toast.error('Produk tidak ditemukan');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal memproses scan'));
    }
  };

  const save = async (complete = false) => {
    if (!items.length) { toast.error('Minimal satu produk'); return; }
    if (invalidItems.length) { toast.error(invalidItems[0].issue); return; }
    setSaving(true);
    try {
      const payload = {
        opname_date: new Date(opnameDate).toISOString(),
        notes: notes || null,
        items: items.map((i) => ({
          product_id: i.product_id,
          system_stock: i.system_stock,
          physical_stock: i.physical_stock,
          reason: i.reason || null,
        })),
      };
      if (isNew) {
        const res = await inventoryApi.createOpname(payload);
        toast.success('Stock opname dibuat');
        navigate(`/inventory/opname/${res.data.id}`, { replace: true });
      } else if (existing.status === 'draft' && can('stock_opname.update')) {
        await inventoryApi.updateOpname(id, payload);
        toast.success('Stock opname diperbarui');
      } else {
        toast.error('Tidak dapat mengubah opname yang sudah selesai');
      }
      if (complete && existing?.status === 'draft') {
        await inventoryApi.completeOpname(id);
        toast.success('Stock opname selesai — stok sistem disesuaikan');
        navigate('/inventory/opname', { replace: true });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan opname'));
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === 'completed').length;
    const mismatch = items.filter((i) => i.status === 'mismatch').length;
    return { total, completed, mismatch };
  }, [items]);

  const invalidItems = useMemo(
    () => items
      .map((i, idx) => ({
        idx,
        issue: i.physical_stock === '' || !Number.isFinite(Number(i.physical_stock))
          ? 'Stok fisik wajib diisi'
          : Number(i.physical_stock) < 0 ? 'Stok fisik tidak boleh negatif' : '',
      }))
      .filter((x) => x.issue),
    [items]
  );

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.product?.name.toLowerCase().includes(q) || i.product?.sku.toLowerCase().includes(q));
  }, [items, search]);

  const isReadOnly = isView && existing?.status !== 'draft';
  const canSave = items.length > 0 && invalidItems.length === 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/opname')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Memuat...</h1>
        </div>
        <Card bodyClassName="p-6"><Skeleton className="h-40 w-full" /></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/inventory/opname')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">
            {isNew ? 'Buat Stock Opname' : isReadOnly ? 'Detail Stock Opname' : 'Edit Stock Opname'}
          </h1>
          <p className="text-sm text-slate-500">
            {isNew ? formatDateTime(opnameDate) : formatDateTime(existing?.opname_date)}
          </p>
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk untuk ditambahkan..." />
          </div>
          <button onClick={handleScan} title="Scan Barcode" className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-primary-400 hover:bg-primary-50 transition-colors">
            <Barcode className="h-5 w-5" />
          </button>
        </div>
      )}

      {!isReadOnly && (products.data?.items || []).length > 0 && (
        <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {(products.data.items || []).map((p) => {
            const added = items.some((i) => i.product_id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                disabled={added}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-left text-xs hover:border-primary-400 hover:bg-primary-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="ml-1 text-slate-400">({formatQty(p.stock)})</span>
                </span>
                <Plus className="h-3 w-3 shrink-0 ml-1 text-primary-500" />
              </button>
            );
          })}
        </div>
      )}
      {!isReadOnly && debounced && (products.data?.items || []).length === 0 && !products.loading && (
        <p className="text-center text-xs text-slate-400">Produk tidak ditemukan</p>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Item Opname ({items.length})</p>
          {filteredItems.map((item) => {
            const diff = Number(item.physical_stock) - Number(item.system_stock);
            return (
              <div key={item.product_id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.product?.name}</p>
                    <p className="text-xs text-slate-400">{item.product?.sku}</p>
                  </div>
                  {!isReadOnly && (
                    <button onClick={() => removeItem(item.product_id)} className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Sistem</span>
                    <span className="tabular-nums font-medium text-slate-700">{formatQty(item.system_stock)}</span>
                  </div>
                  <span className="text-slate-300">→</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Fisik</span>
                    {isReadOnly ? (
                      <span className="tabular-nums font-medium text-slate-800">{formatQty(item.physical_stock)}</span>
                    ) : (
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.physical_stock}
                        onChange={(e) => updateItem(item.product_id, { physical_stock: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="h-6 w-16 text-center text-xs"
                        error={item.physical_stock === '' || Number(item.physical_stock) < 0}
                      />
                    )}
                  </div>
                  <div className="ml-auto">
                    {diff === 0 ? (
                      <Badge color="bg-success-50 text-success-700">OK</Badge>
                    ) : (
                      <Badge color={diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-50 text-danger-700'}>
                        {diff > 0 ? '+' : ''}{formatQty(diff)}
                      </Badge>
                    )}
                  </div>
                </div>
                {!isReadOnly && (
                  <div className="mt-2">
                    <Input
                      value={item.reason}
                      onChange={(e) => updateItem(item.product_id, { reason: e.target.value })}
                      placeholder="Alasan selisih..."
                      className="h-6 text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}
          {filteredItems.length === 0 && items.length > 0 && (
            <div className="py-6 text-center text-xs text-slate-400">Tidak ada item cocok</div>
          )}
        </div>
      )}

      {!isReadOnly && items.length > 0 && stats.mismatch > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <span className="text-amber-700">{stats.mismatch} produk selisih stok</span>
          <button onClick={() => setReviewOpen(true)} className="font-medium text-amber-800 hover:underline">Lihat Detail</button>
        </div>
      )}

      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2 pb-4">
          {!canSave && items.length > 0 && (
            <p className="mr-auto text-xs text-slate-400">{invalidItems.length} stok fisik tidak valid</p>
          )}
          {isView && existing?.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => save(false)} loading={saving} disabled={!canSave} icon={Save}>Simpan Draft</Button>
              <Button onClick={() => setConfirmComplete(true)} disabled={!canSave} icon={ClipboardCheck}>Selesaikan</Button>
            </>
          )}
          {isNew && (
            <Button onClick={() => save(false)} loading={saving} disabled={!canSave} icon={Save}>Simpan Opname</Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => save(true)}
        loading={saving}
        title="Selesaikan stock opname?"
        message="Stok sistem akan disesuaikan menjadi stok fisik. Selisih tercatat di pergerakan stok."
        confirmText="Ya, selesaikan"
      />

      {reviewOpen && (
        <ReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          items={items}
          stats={stats}
          opnameDate={opnameDate}
        />
      )}
    </div>
  );
}

function ReviewModal({ open, onClose, items, stats, opnameDate }) {
  const mismatchItems = items.filter((i) => i.status === 'mismatch');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Review Stock Opname</h2>
            <p className="text-xs text-slate-500">{formatDateTime(opnameDate)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-4">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-primary-50 p-2"><p className="text-primary-600">Total</p><p className="text-base font-bold text-primary-900">{stats.total}</p></div>
            <div className="rounded-lg bg-success-50 p-2"><p className="text-success-600">Sesuai</p><p className="text-base font-bold text-success-900">{stats.completed}</p></div>
            <div className="rounded-lg bg-warning-50 p-2"><p className="text-warning-600">Selisih</p><p className="text-base font-bold text-warning-900">{stats.mismatch}</p></div>
          </div>

          {mismatchItems.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="pb-1.5">Produk</th>
                  <th className="pb-1.5 text-center w-16">Sistem</th>
                  <th className="pb-1.5 text-center w-16">Fisik</th>
                  <th className="pb-1.5 text-center w-16">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mismatchItems.map((item) => {
                  const diff = Number(item.physical_stock) - Number(item.system_stock);
                  return (
                    <tr key={item.product_id}>
                      <td className="py-1.5">
                        <p className="font-medium text-slate-800">{item.product?.name}</p>
                        <p className="text-xs text-slate-400">{item.product?.sku}</p>
                      </td>
                      <td className="py-1.5 text-center text-slate-600">{formatQty(item.system_stock)}</td>
                      <td className="py-1.5 text-center font-medium text-slate-800">{formatQty(item.physical_stock)}</td>
                      <td className="py-1.5 text-center">
                        <Badge color={diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-50 text-danger-700'}>
                          {diff > 0 ? '+' : ''}{formatQty(diff)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Semua stok sesuai</p>
          )}
        </div>
        <div className="border-t border-slate-200 p-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </div>
  );
}
