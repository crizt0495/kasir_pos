import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, ClipboardCheck } from 'lucide-react';
import { inventoryApi, productsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Card, Input, Field, Textarea, SearchInput, ConfirmDialog, StatusBadge, Skeleton } from '../components/ui/index.jsx';
import { formatQty } from '../utils/format.js';

export default function OpnameForm() {
  const { id } = useParams();
  const isView = Boolean(id);
  const isNew = !id;
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [items, setItems] = useState([]); // { product_id, product, system_stock, physical_stock, reason }
  const [notes, setNotes] = useState('');
  const [opnameDate, setOpnameDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isView);
  const [existing, setExisting] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);

  const products = useApi(
    () => productsApi.list({ search: debounced || undefined, pageSize: 20, sort: 'name' }).then((r) => r.data),
    [debounced]
  );

  // Muat data existing (view)
  useEffect(() => {
    if (!isView) return;
    let cancelled = false;
    inventoryApi
      .opname(id)
      .then((res) => {
        if (cancelled) return;
        setExisting(res.data);
        setOpnameDate(res.data.opname_date);
        setNotes(res.data.notes || '');
        setItems(
          res.data.items.map((i) => ({
            product_id: i.product_id,
            product: i.product,
            system_stock: i.system_stock,
            physical_stock: i.physical_stock,
            reason: i.reason || '',
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
      { product_id: product.id, product, system_stock: Number(product.stock), physical_stock: Number(product.stock), reason: '' },
    ]);
  };

  const updateItem = (productId, patch) => {
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, ...patch } : i)));
  };

  const save = async (complete = false) => {
    if (!items.length) {
      toast.error('Minimal satu produk');
      return;
    }
    if (items.some((i) => Number(i.physical_stock) < 0)) {
      toast.error('Stok fisik tidak boleh negatif');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        opname_date: opnameDate,
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
        toast.success('Stock opname selesai — stok disesuaikan');
        navigate('/inventory/opname', { replace: true });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan opname'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card bodyClassName="p-6">
        <Skeleton className="mb-4 h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  const isReadOnly = isView && existing?.status !== 'draft';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/inventory/opname')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">
            {isNew ? 'Buat Stock Opname' : isReadOnly ? 'Detail Stock Opname' : 'Edit Stock Opname'}
          </h1>
          <p className="text-sm text-slate-500">
            {isNew ? 'Pilih produk, isi stok fisik, dan catat selisih' : `${existing?.opname_date} · `}
            {existing && <StatusBadge status={existing.status} />}
          </p>
        </div>
        {isReadOnly && existing?.status === 'completed' && (
          <p className="text-xs text-slate-400">{existing.items.filter((i) => Number(i.difference) !== 0).length} produk disesuaikan</p>
        )}
      </div>

      <Card bodyClassName="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tanggal Opname">
            <Input type="date" value={opnameDate} onChange={(e) => setOpnameDate(e.target.value)} disabled={isReadOnly} />
          </Field>
          <Field label="Catatan">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReadOnly} placeholder="Catatan opname..." />
          </Field>
        </div>
      </Card>

      {/* Pilih produk */}
      {!isReadOnly && (
        <Card bodyClassName="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Tambah Produk</p>
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." className="w-64" />
          </div>
          <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {products.loading ? (
              <p className="col-span-full text-sm text-slate-400">Memuat...</p>
            ) : (products.data?.items || []).length === 0 ? (
              <p className="col-span-full text-sm text-slate-400">Produk tidak ditemukan</p>
            ) : (
              products.data.items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  disabled={items.some((i) => i.product_id === p.id)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-indigo-400 disabled:opacity-40"
                >
                  <div>
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">Stok sistem: {formatQty(p.stock)}</p>
                  </div>
                  <Plus className="h-4 w-4 text-indigo-500" />
                </button>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Daftar item */}
      <Card title={`Item Opname (${items.length})`} bodyClassName="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Belum ada produk. {isReadOnly ? '' : 'Tambahkan produk di atas.'}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const diff = Number(item.physical_stock) - Number(item.system_stock);
              return (
                <div key={item.product_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.product?.name}</p>
                    <p className="text-xs text-slate-400">{item.product?.sku}</p>
                  </div>
                  <div className="grid grid-cols-3 items-end gap-2 sm:flex sm:items-center sm:gap-3">
                    <Field label="Stok Sistem">
                      <Input type="number" value={item.system_stock} disabled className="w-24" />
                    </Field>
                    <Field label="Stok Fisik">
                      <Input
                        type="number"
                        value={item.physical_stock}
                        disabled={isReadOnly}
                        onChange={(e) => updateItem(item.product_id, { physical_stock: Number(e.target.value) })}
                        className="w-24"
                      />
                    </Field>
                    <Field label="Selisih">
                      <div className={`w-20 rounded-lg border px-2 py-2 text-sm font-semibold ${diff > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : diff < 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                        {diff > 0 ? '+' : ''}{formatQty(diff)}
                      </div>
                    </Field>
                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        <Field label="Alasan" className="flex-1">
                          <Input
                            value={item.reason}
                            onChange={(e) => updateItem(item.product_id, { reason: e.target.value })}
                            placeholder="Alasan selisih"
                            className="w-40"
                          />
                        </Field>
                        <button onClick={() => setItems((prev) => prev.filter((i) => i.product_id !== item.product_id))} className="mb-1 rounded-md p-1.5 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!isReadOnly && (
        <div className="flex justify-end gap-2">
          {isView && existing?.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => save(false)} loading={saving} icon={Save}>
                Simpan Draft
              </Button>
              <Button onClick={() => setConfirmComplete(true)} icon={ClipboardCheck}>
                Selesaikan Opname
              </Button>
            </>
          )}
          {isNew && (
            <Button onClick={() => save(false)} loading={saving} icon={Save}>
              Simpan Opname
            </Button>
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
    </div>
  );
}
