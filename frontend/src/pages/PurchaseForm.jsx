import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { purchasesApi, suppliersApi, productsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Card, Field, Input, Select, Skeleton, SearchInput } from '../components/ui/index.jsx';
import { formatRupiah } from '../utils/format.js';

const parseNum = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function PurchaseForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // { product_id, product, quantity, cost_price }
  const [productSearch, setProductSearch] = useState('');
  const debouncedSearch = useDebounce(productSearch, 300);
  const [saving, setSaving] = useState(false);

  const suppliers = useApi(() => suppliersApi.list({ status: 'active', pageSize: 100 }).then((r) => r.data), []);
  const products = useApi(
    () => productsApi.list({ search: debouncedSearch || undefined, pageSize: 20, sort: 'name' }).then((r) => r.data),
    [debouncedSearch]
  );

  // Load data saat edit
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    purchasesApi
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        setSupplierId(d.supplier_id || '');
        setInvoiceNumber(d.invoice_number || '');
        setPurchaseDate(d.purchase_date);
        setDiscount(Number(d.discount) || 0);
        setNotes(d.notes || '');
        setItems(d.items.map((i) => ({ product_id: i.product_id, product: i.product, quantity: Number(i.quantity), cost_price: Number(i.cost_price) })));
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isEdit]);

  const addProduct = (product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) => (i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { product_id: product.id, product, quantity: 1, cost_price: Number(product.purchase_price) }];
    });
    setProductSearch('');
  };

  const updateItem = (productId, patch) => {
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, ...patch } : i)));
  };

  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_price), 0);
  const total = subtotal - Number(discount);

  const itemIssues = useMemo(
    () =>
      items.map((i) => {
        const issues = {};
        if (!Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0 || i.quantity === '') {
          if (i.quantity === '' || !Number.isFinite(Number(i.quantity))) issues.quantity = 'Qty wajib diisi';
          else issues.quantity = 'Qty harus lebih dari 0';
        }
        if (i.cost_price === '' || !Number.isFinite(Number(i.cost_price))) issues.cost_price = 'Harga beli wajib diisi';
        else if (Number(i.cost_price) < 0) issues.cost_price = 'Harga beli tidak boleh negatif';
        return issues;
      }),
    [items]
  );

  const dateValid = Boolean(purchaseDate) && !Number.isNaN(new Date(purchaseDate).getTime());
  const discountNum = parseNum(discount);
  const headerErrors = {
    purchase_date: dateValid ? '' : 'Tanggal pembelian wajib diisi',
    invoice_number: invoiceNumber.length > 100 ? 'No. invoice maksimal 100 karakter' : '',
    discount: discountNum === null ? 'Diskon tidak valid' : discountNum < 0 ? 'Diskon tidak boleh negatif' : '',
  };
  const canSave =
    dateValid &&
    !headerErrors.invoice_number &&
    !headerErrors.discount &&
    items.length > 0 &&
    itemIssues.every((issues) => Object.keys(issues).length === 0);

  const save = async () => {
    if (!items.length) {
      toast.error('Tambahkan minimal satu produk');
      return;
    }
    if (itemIssues.some((i) => i.quantity)) {
      toast.error('Qty harus lebih dari 0');
      return;
    }
    if (itemIssues.some((i) => i.cost_price)) {
      toast.error('Harga beli tidak valid');
      return;
    }
    setSaving(true);
    const payload = {
      supplier_id: supplierId || null,
      invoice_number: invoiceNumber || null,
      purchase_date: purchaseDate,
      discount: Number(discount) || 0,
      notes: notes || null,
      items: items.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity), cost_price: Number(i.cost_price) })),
    };
    try {
      if (isEdit) {
        await purchasesApi.update(id, payload);
        toast.success('Pembelian berhasil diperbarui');
      } else {
        await purchasesApi.create(payload);
        toast.success('Pembelian berhasil dibuat');
      }
      navigate('/purchases');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan pembelian'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card bodyClassName="p-6">
        <Skeleton className="mb-4 h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/purchases')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit Pembelian' : 'Tambah Pembelian'}</h1>
          <p className="text-sm text-slate-500">Catat pembelian dari supplier</p>
        </div>
      </div>

      <Card bodyClassName="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Supplier" hint="Opsional">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Pilih supplier</option>
              {(suppliers.data?.items || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="No. Invoice Supplier" hint="Opsional" error={headerErrors.invoice_number}>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV/2026/001" maxLength={100} error={!!headerErrors.invoice_number} />
          </Field>
          <Field label="Tanggal Pembelian" required error={headerErrors.purchase_date}>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} error={!!headerErrors.purchase_date} />
          </Field>
        </div>
      </Card>

      <Card bodyClassName="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Produk</p>
          <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Cari produk..." className="w-64" />
        </div>
        <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {products.loading ? (
            <p className="col-span-full text-sm text-slate-400">Memuat...</p>
          ) : (products.data?.items || []).length === 0 ? (
            <p className="col-span-full text-sm text-slate-400">Produk tidak ditemukan</p>
          ) : (
            products.data.items.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-primary-400">
                <div>
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.sku} · HPP {formatRupiah(p.purchase_price)}</p>
                </div>
                <Plus className="h-4 w-4 text-primary-500" />
              </button>
            ))
          )}
        </div>
      </Card>

      <Card title={`Item Pembelian (${items.length})`} bodyClassName="p-0">
        {items.length === 0 ? (
          <div className="space-y-1 p-6 text-center">
            <p className="text-sm text-slate-400">Belum ada produk.</p>
            <p className="text-xs text-danger-600" role="alert">Tambahkan minimal satu produk untuk menyimpan</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item, idx) => {
              const issues = itemIssues[idx] || {};
              return (
                <div key={item.product_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.product?.name}</p>
                    <p className="text-xs text-slate-400">{item.product?.sku}</p>
                    {Object.values(issues)[0] && (
                      <p className="mt-0.5 text-xs text-danger-600 sm:hidden" role="alert">{Object.values(issues)[0]}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Field label="Qty" error={issues.quantity}>
                      <Input type="number" min="0" step="any" value={item.quantity} onChange={(e) => updateItem(item.product_id, { quantity: e.target.value === '' ? '' : Number(e.target.value) })} className="w-20" error={!!issues.quantity} />
                    </Field>
                    <Field label="Harga Beli" error={issues.cost_price}>
                      <Input type="number" min="0" step="any" value={item.cost_price} onChange={(e) => updateItem(item.product_id, { cost_price: e.target.value === '' ? '' : Number(e.target.value) })} className="w-28" error={!!issues.cost_price} />
                    </Field>
                    <p className="w-28 pt-5 text-right text-sm font-semibold text-slate-800">
                      {formatRupiah((Number(item.quantity) || 0) * Number(item.cost_price))}
                    </p>
                    <button onClick={() => setItems((prev) => prev.filter((i) => i.product_id !== item.product_id))} className="mb-1 rounded-md p-1.5 text-red-400 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card bodyClassName="p-5">
        <div className="flex flex-col items-end gap-3">
          <div className="flex w-full max-w-xs items-center justify-between">
            <span className="text-sm text-slate-500">Subtotal</span>
            <span className="text-sm font-semibold">{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex w-full max-w-xs items-center justify-between">
            <span className="text-sm text-slate-500">Diskon</span>
            <div className="flex flex-col items-end">
              <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value === '' ? 0 : Number(e.target.value))} className={`w-32 text-right ${headerErrors.discount ? 'border-danger-400' : ''}`} />
              {headerErrors.discount && <p className="mt-1.5 text-xs text-danger-600" role="alert">{headerErrors.discount}</p>}
            </div>
          </div>
          <div className="flex w-full max-w-xs items-center justify-between border-t border-slate-200 pt-2">
            <span className="text-sm font-semibold text-slate-700">Total</span>
            <span className="text-lg font-bold text-primary-700">{formatRupiah(total)}</span>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {!canSave && (
          <p className="mr-auto text-xs text-slate-400">
            {items.length === 0
              ? 'Tambahkan minimal satu produk dengan qty dan harga yang valid'
              : 'Lengkapi qty & harga beli setiap item untuk menyimpan'}
          </p>
        )}
        <Button variant="secondary" onClick={() => navigate('/purchases')}>Batal</Button>
        <Button onClick={save} loading={saving} disabled={!canSave} icon={Save}>Simpan Pembelian</Button>
      </div>
    </div>
  );
}
