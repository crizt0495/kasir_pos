import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, ClipboardCheck, TrendingUp, TrendingDown, CheckCircle, Clock, AlertTriangle, Package, Plus, Trash2, Barcode, X as XIcon } from 'lucide-react';
import { inventoryApi, productsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Card, Input, Field, SearchInput, ConfirmDialog, Badge, StatCard, ProgressBar, Skeleton } from '../components/ui/index.jsx';
import { formatDateTime, formatQty, formatRupiah } from '../utils/format.js';

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
  const [progress, setProgress] = useState({ started: 0, total: 0, completed: 0, inProgress: 0 });

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
        const total = res.data.items.length;
        const started = res.data.items.filter((i) => i.status !== 'pending').length;
        const completed = res.data.items.filter((i) => i.status === 'completed').length;
        setProgress({ started, total, completed, inProgress: started - completed });
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isView]);

  useEffect(() => {
    if (items.length > 0) {
      const total = items.length;
      const started = items.filter((i) => i.status !== 'pending').length;
      const completed = items.filter((i) => i.status === 'completed').length;
      setProgress({ started, total, completed, inProgress: started - completed });
    }
  }, [items]);

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
        status: 'pending'
      },
    ]);
  };

  const updateItem = (productId, patch) => {
    setItems((prev) => {
      const updated = prev.map((i) => (i.product_id === productId ? { ...i, ...patch } : i));
      return updated.map((item) => {
        const diff = Number(item.physical_stock) - Number(item.system_stock);
        let newStatus = 'pending';
        if (diff !== 0) {
          newStatus = 'mismatch';
        } else if (item.status !== 'pending') {
          newStatus = 'completed';
        }
        return { ...item, status: newStatus };
      });
    });
  };

  const removeItem = (productId) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const handleScan = async () => {
    try {
      const mockBarcode = prompt('Masukkan kode barcode:');
      if (mockBarcode) {
        const { data } = await productsApi.list({ search: mockBarcode, pageSize: 1 });
        if (data.items && data.items.length > 0) {
          const product = data.items[0];
          addProduct(product);
          toast.success(`Ditemukan: ${product.name}`);
        } else {
          toast.error('Produk tidak ditemukan dengan barcode tersebut');
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal memproses scan'));
    }
  };

  const save = async (complete = false) => {
    if (!items.length) {
      toast.error('Minimal satu produk');
      return;
    }
    if (invalidItems.length) {
      toast.error(invalidItems[0].issue);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        opname_date: opnameDate ? new Date(opnameDate).toISOString() : undefined,
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
        toast.success('Stock opname selesai — stok sistem disesuaikan dengan stok fisik');
        navigate('/inventory/opname', { replace: true });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan opname'));
    } finally {
      setSaving(false);
    }
  };

  const getStats = () => {
    const total = items.length;
    const notStarted = items.filter((i) => i.status === 'pending').length;
    const completed = items.filter((i) => i.status === 'completed').length;
    const mismatch = items.filter((i) => i.status === 'mismatch').length;
    const less = items.filter((i) => Number(i.physical_stock) < Number(i.system_stock)).length;
    const more = items.filter((i) => Number(i.physical_stock) > Number(i.system_stock)).length;
    const totalValue = items.reduce((sum, i) => sum + (Number(i.physical_stock) - Number(i.system_stock)) * (i.product?.sale_price || 0), 0);
    return { total, notStarted, completed, mismatch, less, more, totalValue };
  };

  const invalidItems = useMemo(
    () =>
      items
        .map((i, idx) => ({
          idx,
          issue:
            i.physical_stock === '' || !Number.isFinite(Number(i.physical_stock))
              ? 'Stok fisik wajib diisi'
              : Number(i.physical_stock) < 0
                ? 'Stok fisik tidak boleh negatif'
                : '',
        }))
        .filter((x) => x.issue)
  , [items]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    return items.filter(item =>
      item.product.name.toLowerCase().includes(search.toLowerCase()) ||
      item.product.sku.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, search]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/opname')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">Memuat...</h1>
          </div>
        </div>
        <Card bodyClassName="p-6">
          <Skeleton className="mt-6 h-40 w-full" />
        </Card>
      </div>
    );
  }

  const isReadOnly = isView && existing?.status !== 'draft';
  const stats = getStats();
  const canSave = items.length > 0 && invalidItems.length === 0;

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
            {isNew ? 'Pilih produk, isi stok fisik, dan catat selisih' : `${formatDateTime(existing?.opname_date)}`}
          </p>
        </div>
      </div>

      {items.length > 0 && !isReadOnly && (
        <Card bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-4">
            <StatCard label="Total Produk" value={stats.total} icon={Package} color="bg-primary-50 text-primary-600" className="p-3" />
            <StatCard label="Sesuai" value={stats.completed} icon={CheckCircle} color="bg-success-50 text-success-600" className="p-3" />
            <StatCard label="Selisih" value={stats.mismatch} icon={AlertTriangle} color="bg-warning-50 text-warning-600" className="p-3" />
            <StatCard label="Nilai Selisih" value={formatRupiah(stats.totalValue)} icon={TrendingUp} color="bg-info-50 text-info-600" className="p-3" />
          </div>
          {stats.total > 0 && (
            <div className="mt-4">
              <ProgressBar value={stats.completed} max={stats.total} showLabel className="h-2" />
            </div>
          )}
        </Card>
      )}

      <Card bodyClassName="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          </div>
          {!isReadOnly && (
            <button onClick={handleScan} title="Scan Barcode" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-primary-400 hover:bg-primary-50 transition-colors">
              <Barcode className="h-5 w-5" />
            </button>
          )}
        </div>
      </Card>

      {!isReadOnly && (products.data?.items || []).length > 0 && (
        <Card bodyClassName="p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Klik untuk menambahkan produk</p>
          <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
            {(products.data.items || []).map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                disabled={items.some((i) => i.product_id === p.id)}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-primary-400 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 truncate text-xs">{p.name}</p>
                  <p className="text-[11px] text-slate-400">Stok: {formatQty(p.stock)}</p>
                </div>
                <Plus className="h-3.5 w-3.5 text-primary-500 ml-1 shrink-0" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <Card title={`Item Opname (${items.length})`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5 w-8">No</th>
                  <th className="px-4 py-2.5">Produk</th>
                  <th className="px-4 py-2.5 text-center w-24">Stok Sistem</th>
                  <th className="px-4 py-2.5 text-center w-24">Stok Fisik</th>
                  <th className="px-4 py-2.5 text-center w-24">Selisih</th>
                  {!isReadOnly && <th className="px-4 py-2.5 w-40">Alasan</th>}
                  {!isReadOnly && <th className="px-4 py-2.5 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => {
                  const diff = Number(item.physical_stock) - Number(item.system_stock);
                  return (
                    <tr key={item.product_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{item.product?.name}</p>
                        <p className="text-xs text-slate-400">{item.product?.sku}</p>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="font-medium text-slate-700">{formatQty(item.system_stock)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isReadOnly ? (
                          <span className="font-medium text-slate-700">{formatQty(item.physical_stock)}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.physical_stock}
                            onChange={(e) => updateItem(item.product_id, { physical_stock: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="h-8 w-20 text-center mx-auto"
                            error={item.physical_stock === '' || Number(item.physical_stock) < 0}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {diff === 0 ? (
                          <Badge color="bg-success-50 text-success-700">Sesuai</Badge>
                        ) : diff < 0 ? (
                          <Badge color="bg-danger-50 text-danger-700" className="inline-flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" /> {formatQty(diff)}
                          </Badge>
                        ) : (
                          <Badge color="bg-emerald-50 text-emerald-700" className="inline-flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> +{formatQty(diff)}
                          </Badge>
                        )}
                      </td>
                      {!isReadOnly && (
                        <td className="px-4 py-2.5">
                          <Input
                            value={item.reason}
                            onChange={(e) => updateItem(item.product_id, { reason: e.target.value })}
                            placeholder="Alasan selisih"
                            className="h-8 text-xs"
                          />
                        </td>
                      )}
                      {!isReadOnly && (
                        <td className="px-4 py-2.5">
                          <button onClick={() => removeItem(item.product_id)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredItems.length === 0 && items.length > 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              Produk tidak cocok dengan pencarian
            </div>
          )}
        </Card>
      )}

      {items.length > 0 && !isReadOnly && (
        <Card bodyClassName="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">{stats.total}</span> produk ·{' '}
              <span className="text-success-600">{stats.completed} sesuai</span> ·{' '}
              <span className="text-warning-600">{stats.mismatch} selisih</span>
            </div>
            <button onClick={() => setReviewOpen(true)} className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
              Review Detail →
            </button>
          </div>
        </Card>
      )}

      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2 pb-4">
          {!canSave && (
            <p className="mr-auto text-xs text-slate-400" role="alert">
              {items.length === 0 ? 'Tambahkan minimal satu produk' : `${invalidItems.length} produk memiliki stok fisik tidak valid`}
            </p>
          )}
          {isView && existing?.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => save(false)} loading={saving} disabled={!canSave} icon={Save}>
                Simpan Draft
              </Button>
              <Button onClick={() => setConfirmComplete(true)} disabled={!canSave} icon={ClipboardCheck}>
                Selesaikan Opname
              </Button>
            </>
          )}
          {isNew && (
            <Button onClick={() => save(false)} loading={saving} disabled={!canSave} icon={Save}>
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

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        items={items}
        stats={stats}
        opnameDate={opnameDate}
      />
    </div>
  );
}

function ReviewModal({ open, onClose, items, stats, opnameDate }) {
  if (!open) return null;

  const mismatchItems = items.filter(i => i.status === 'mismatch');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Review Stock Opname</h2>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          {opnameDate && (
            <p className="mt-0.5 text-sm text-slate-500">
              {formatDateTime(opnameDate)}
            </p>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-primary-50 p-3 text-center">
              <p className="text-primary-600">Total</p>
              <p className="text-lg font-bold text-primary-900">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-success-50 p-3 text-center">
              <p className="text-success-600">Sesuai</p>
              <p className="text-lg font-bold text-success-900">{stats.completed}</p>
            </div>
            <div className="rounded-lg bg-warning-50 p-3 text-center">
              <p className="text-warning-600">Selisih</p>
              <p className="text-lg font-bold text-warning-900">{stats.mismatch}</p>
            </div>
            <div className="rounded-lg bg-danger-50 p-3 text-center">
              <p className="text-danger-600">Kurang</p>
              <p className="text-lg font-bold text-danger-900">{stats.less}</p>
            </div>
          </div>

          {mismatchItems.length > 0 ? (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                    <th className="px-3 py-2">Produk</th>
                    <th className="px-3 py-2 text-center w-20">Sistem</th>
                    <th className="px-3 py-2 text-center w-20">Fisik</th>
                    <th className="px-3 py-2 text-center w-20">Selisih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mismatchItems.map((item) => {
                    const diff = Number(item.physical_stock) - Number(item.system_stock);
                    return (
                      <tr key={item.product_id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">{item.product?.name}</p>
                          <p className="text-xs text-slate-400">{item.product?.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-center text-slate-600">{formatQty(item.system_stock)}</td>
                        <td className="px-3 py-2 text-center font-medium text-slate-800">{formatQty(item.physical_stock)}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge color={diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-50 text-danger-700'}>
                            {diff > 0 ? '+' : ''}{formatQty(diff)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              Semua stok sesuai — tidak ada selisih
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 p-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </div>
  );
}
