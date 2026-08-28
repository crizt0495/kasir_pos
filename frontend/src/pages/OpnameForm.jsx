import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, ClipboardCheck, Plus, Trash2, Barcode, X as XIcon } from 'lucide-react';
import { inventoryApi, productsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Input, SearchInput, ConfirmDialog, Badge, Skeleton, BarcodeScanner } from '../components/ui/index.jsx';
import { formatDateTime, formatQty } from '../utils/format.js';

export default function OpnameForm() {
  const { id } = useParams();
  const isView = Boolean(id);
  const isNew = !id;
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [notes, setNotes] = useState('');
  const [opnameDate] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isView);
  const [existing, setExisting] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [itemStocks, setItemStocks] = useState({});
  const [itemReasons, setItemReasons] = useState({});

  const products = useApi(
    () => productsApi.list({ search: debounced || undefined, pageSize: 200, sort: 'name' }).then((r) => r.data),
    [debounced]
  );

  useEffect(() => {
    if (!isView) return;
    let cancelled = false;
    inventoryApi.opname(id).then((res) => {
      if (cancelled) return;
      setExisting(res.data);
      setNotes(res.data.notes || '');
      const stocks = {};
      const reasons = {};
      res.data.items.forEach((i) => {
        stocks[i.product_id] = i.physical_stock;
        reasons[i.product_id] = i.reason || '';
      });
      setItemStocks(stocks);
      setItemReasons(reasons);
    }).catch((e) => toast.error(getErrorMessage(e))).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isView]);

  const itemPhysicalStock = (productId) => itemStocks[productId] ?? null;
  const itemReason = (productId) => itemReasons[productId] ?? '';

  const updateStock = (productId, value) => {
    setItemStocks((prev) => ({ ...prev, [productId]: value }));
  };

  const updateReason = (productId, value) => {
    setItemReasons((prev) => ({ ...prev, [productId]: value }));
  };

  const selectedItems = useMemo(() => {
    if (!products.data?.items) return [];
    return products.data.items.filter((p) => {
      const v = itemStocks[p.id];
      const hasValue = v !== null && v !== '' && !isNaN(Number(v));
      return hasValue;
    });
  }, [products.data, itemStocks]);

  const getItemDiff = (product) => {
    const physical = Number(itemStocks[product.id]);
    if (isNaN(physical)) return null;
    return physical - Number(product.stock);
  };

  const handleScan = async (code) => {
    if (!code) return;
    setScannerOpen(false);
    try {
      const { data } = await productsApi.byBarcode(code);
      if (!data) {
        toast.error('Produk tidak ditemukan');
        return;
      }
      const current = itemStocks[data.id];
      const next = (current === null || current === undefined || current === '' || isNaN(Number(current)))
        ? 1
        : Number(current) + 1;
      updateStock(data.id, next);
      setSearch('');
      toast.success(`${data.name} (${next})`);
      window.requestAnimationFrame(() => {
        const el = document.querySelector(`[data-physical-stock-input="${data.id}"]`);
        if (el) {
          el.focus();
          el.select();
        }
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Produk tidak ditemukan'));
    }
  };

  const save = async (complete = false) => {
    if (!selectedItems.length) { toast.error('Minimal isi stok fisik satu produk'); return; }
    setSaving(true);
    try {
      const payload = {
        opname_date: new Date(opnameDate).toISOString(),
        notes: notes || null,
        items: selectedItems.map((p) => ({
          product_id: p.id,
          system_stock: Number(p.stock),
          physical_stock: Number(itemStocks[p.id]),
          reason: itemReasons[p.id] || null,
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
    let sesuai = 0, kurang = 0, lebih = 0;
    selectedItems.forEach((p) => {
      const diff = getItemDiff(p);
      if (diff === null) return;
      if (diff === 0) sesuai++;
      else if (diff < 0) kurang++;
      else lebih++;
    });
    return { total: selectedItems.length, sesuai, kurang, lebih, selisih: kurang + lebih };
  }, [selectedItems, itemStocks]);

  const isReadOnly = isView && existing?.status !== 'draft';
  const canSave = selectedItems.length > 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory/opname')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Memuat...</h1>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      </div>
    );
  }

  const mismatchItems = selectedItems.filter((p) => {
    const d = getItemDiff(p);
    return d !== null && d !== 0;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-3">
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
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          </div>
          <button onClick={() => setScannerOpen(true)} title="Scan Barcode" className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-primary-400 hover:bg-primary-50 transition-colors">
            <Barcode className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(products.data?.items || []).map((p) => {
          const physical = itemPhysicalStock(p.id);
          const diff = getItemDiff(p);
          const isFilled = physical !== null && physical !== '' && !isNaN(Number(physical));

          return (
            <div
              key={p.id}
              className={`rounded-xl border-2 bg-white p-3 transition-all ${
                isFilled
                  ? diff === 0 ? 'border-success-300 shadow-sm shadow-success-100'
                    : diff !== null ? 'border-warning-300 shadow-sm shadow-warning-100'
                    : 'border-slate-200'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{p.sku}</p>
                </div>
                {isFilled && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                    diff === 0 ? 'bg-success-100 text-success-700' : diff !== null ? 'bg-warning-100 text-warning-700' : ''
                  }`}>
                    {diff === 0 ? 'OK' : diff !== null ? `${diff > 0 ? '+' : ''}${diff}` : ''}
                  </span>
                )}
              </div>

              {p.barcode && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-slate-50 px-2 py-1">
                  <Barcode className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="font-mono text-[11px] tracking-widest text-slate-500">{p.barcode}</span>
                </div>
              )}

              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <span>Stok Sistem:</span>
                <span className="font-semibold text-slate-700">{formatQty(p.stock)}</span>
              </div>

              {!isReadOnly && (
                <div className="mt-1.5">
                  <label className="text-xs text-slate-500">Stok Fisik</label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={physical ?? ''}
                    onChange={(e) => updateStock(p.id, e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="0"
                    className="mt-0.5 h-8 text-sm"
                    data-physical-stock-input={p.id}
                  />
                </div>
              )}

              {!isReadOnly && (
                <div className="mt-1.5">
                  <Input
                    value={itemReason(p.id)}
                    onChange={(e) => updateReason(p.id, e.target.value)}
                    placeholder="Alasan..."
                    className="h-6 text-xs"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(products.data?.items || []).length === 0 && !products.loading && (
        <div className="py-12 text-center text-sm text-slate-400">
          {debounced ? 'Produk tidak ditemukan' : 'Tidak ada produk'}
        </div>
      )}

      {!isReadOnly && mismatchItems.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <span className="text-amber-700">{mismatchItems.length} produk selisih stok</span>
          <button onClick={() => setReviewOpen(true)} className="font-medium text-amber-800 hover:underline">Lihat Detail</button>
        </div>
      )}

      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2 pb-4">
          {!canSave && (
            <p className="mr-auto text-xs text-slate-400">Isi stok fisik minimal satu produk</p>
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

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />

      {reviewOpen && (
        <ReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          items={selectedItems}
          itemStocks={itemStocks}
          stats={stats}
          opnameDate={opnameDate}
        />
      )}
    </div>
  );
}

function ReviewModal({ open, onClose, items, itemStocks, stats, opnameDate }) {
  const mismatchItems = items.filter((p) => {
    const physical = Number(itemStocks[p.id]);
    if (isNaN(physical)) return false;
    const diff = physical - Number(p.stock);
    return diff !== 0;
  });

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
            <div className="rounded-lg bg-success-50 p-2"><p className="text-success-600">Sesuai</p><p className="text-base font-bold text-success-900">{stats.sesuai}</p></div>
            <div className="rounded-lg bg-warning-50 p-2"><p className="text-warning-600">Selisih</p><p className="text-base font-bold text-warning-900">{stats.selisih}</p></div>
          </div>

          {mismatchItems.length > 0 ? (
            <div className="space-y-2">
              {mismatchItems.map((p) => {
                const physical = Number(itemStocks[p.id]);
                const diff = physical - Number(p.stock);
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-2">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.sku}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">{formatQty(p.stock)}</span>
                      <span className="text-slate-300">→</span>
                      <span className="font-semibold text-slate-800">{formatQty(physical)}</span>
                      <Badge color={diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-50 text-danger-700'}>
                        {diff > 0 ? '+' : ''}{diff}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
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
