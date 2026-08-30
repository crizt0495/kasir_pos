import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, Users, PauseCircle, PlayCircle,
  Package, ScanLine, Banknote, X, Percent, Camera,
} from 'lucide-react';
import { productsApi, categoriesApi, customersApi, salesApi, settingsApi, cashierApi } from '../api/index.js';
import { useCartStore } from '../stores/cartStore.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useApi } from '../hooks/useApi.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { computeTotals, computeTax, computeChange } from '../utils/cart.js';
import { formatRupiah, formatNumber, formatQty, formatDateTime, paymentMethodLabel } from '../utils/format.js';
import {
  Button, Modal, ConfirmDialog, Input, Select, Field, Textarea, Skeleton, EmptyState, ErrorState, Badge, BarcodeScanner,
} from '../components/ui/index.jsx';
import ReceiptModal from '../components/pos/ReceiptModal.jsx';
import ProductImage from '../components/ProductImage.jsx';

const PAYMENT_METHODS = ['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'];

export default function POS() {
  const cart = useCartStore();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [categoryId, setCategoryId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const debouncedCustomer = useDebounce(customerQuery, 300);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [settings, setSettings] = useState({});
  const [taxRate, setTaxRate] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [additionalCost, setAdditionalCost] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const searchRef = useRef(null);
  const barcodeRef = useRef(null);

  const products = useApi(
    () => productsApi.list({ search: debouncedSearch, category_id: categoryId || undefined, pageSize: 100, sort: 'name' }).then((r) => r.data),
    [debouncedSearch, categoryId]
  );
  const categories = useApi(() => categoriesApi.list({ status: 'active' }).then((r) => r.data), []);
  const customerResults = useApi(
    () => customersApi.list({ search: debouncedCustomer, is_general: 'false', pageSize: 10 }).then((r) => r.data),
    [debouncedCustomer]
  );
  // Pelanggan default: "Pelanggan Umum" (tidak masuk perhitungan bagi hasil 2,5%)
  const generalCustomer = useApi(
    () => customersApi.list({ is_general: 'true', pageSize: 1 }).then((r) => r.data?.items?.[0] || null),
    []
  );

  // Muat settings toko + sesi kas terbuka
  useEffect(() => {
    settingsApi.get().then((r) => {
      setSettings(r.data);
      setTaxRate(Number(r.data?.tax?.percentage || 0));
      setTaxEnabled(r.data?.tax?.enabled === true);
    }).catch(() => {});
    cashierApi.openSession().then((r) => setSessionId(r.data?.id || null)).catch(() => {});
  }, []);

  // Defaultkan pelanggan ke "Pelanggan Umum" saat keranjang belum punya pelanggan
  useEffect(() => {
    if (generalCustomer.data && !cart.customer) {
      cart.setCustomer(generalCustomer.data);
    }
  }, [generalCustomer.data, cart.customer, cart.setCustomer]);

  const taxAmount = useMemo(() => {
    if (!taxEnabled) return 0;
    const { subtotal, discount } = computeTotals(cart.items, cart.discount);
    return computeTax(subtotal - discount, taxRate);
  }, [cart.items, cart.discount, taxEnabled, taxRate]);

  const totals = useMemo(
    () => computeTotals(cart.items, cart.discount, taxAmount, additionalCost),
    [cart.items, cart.discount, taxAmount, additionalCost]
  );

  // Keyboard shortcuts: F2 search, F4 customer, F8 payment
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        barcodeRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowCustomer(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.items.length) setShowCheckout(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart.items.length]);

  const addProductByCode = useCallback(async (code) => {
    if (!code) return;
    try {
      const res = await productsApi.byBarcode(code);
      if (Number(res.data.stock) <= 0) {
        toast.error(`${res.data.name} stok habis`);
      } else {
        cart.add(res.data);
        toast.success(`${res.data.name} ditambahkan`);
      }
    } catch {
      toast.error('Produk tidak ditemukan');
    }
    setBarcode('');
    barcodeRef.current?.focus();
  }, [cart]);

  const handleBarcode = useCallback(() => {
    addProductByCode(barcode.trim());
  }, [barcode, addProductByCode]);

  const handleScan = useCallback((code) => {
    setScannerOpen(false);
    addProductByCode(code);
  }, [addProductByCode]);

  const handleCheckout = async (payload) => {
    try {
      // Kirim item keranjang ke API (product_id, qty, harga, diskon)
      const items = cart.items.map((i) => ({
        product_id: i.product.id,
        quantity: i.quantity,
        price: i.product.sale_price,
        discount: i.discount || 0,
      }));
      const res = await salesApi.create({
        ...payload,
        items,
        customer_id: cart.customer?.id || null,
        session_id: sessionId || null,
        discount: Number(cart.discount) || 0,
      });
      setLastSale(res.data.sale);
      cart.clear();
      setShowCheckout(false);
      setShowReceipt(true);
      if (settings?.pos?.auto_print_receipt === true) {
        setTimeout(() => window.print(), 400);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Transaksi gagal'));
      throw error;
    }
  };

  const itemCount = cart.itemCount();

  return (
    <div className="flex h-full flex-col gap-4 xl:h-[calc(100vh-6.5rem)] xl:flex-row">
      {/* ================= KIRI: produk ================= */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk (F2)..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
              />
            </div>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBarcode()}
                placeholder="Scan barcode (F3)..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150 sm:w-52"
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                title="Scan barcode (kamera)"
                aria-label="Scan barcode dengan kamera"
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-primary-50 hover:text-primary-600"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-3 text-[0.65rem] text-slate-400 lg:flex">
            <span className="flex items-center gap-1.5"><kbd className="kbd">F2</kbd> Cari</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">F3</kbd> Barcode</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">F4</kbd> Pelanggan</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">F8</kbd> Bayar</span>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoryId('')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 ${
              !categoryId ? 'bg-primary-600 text-white' : 'bg-surface text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            Semua
          </button>
          {(categories.data?.items || []).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                categoryId === c.id ? 'bg-primary-600 text-white' : 'bg-surface text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto pb-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
          {products.loading ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : products.error ? (
            <div className="col-span-full">
              <ErrorState onRetry={products.reload} />
            </div>
          ) : !products.data?.items?.length ? (
            <div className="col-span-full">
              <EmptyState title="Produk tidak ditemukan" />
            </div>
          ) : (
            products.data.items.map((p) => {
              const outOfStock = Number(p.stock) <= 0;
              const inactive = p.status !== 'active';
              const disabled = inactive || outOfStock;
              return (
              <button
                key={p.id}
                onClick={() => {
                  if (disabled) {
                    if (outOfStock) toast.error(`${p.name} stok habis`);
                    return;
                  }
                  cart.add(p);
                }}
                disabled={disabled}
                aria-disabled={disabled}
                className={`group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all duration-200 ${disabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'hover:border-primary-300'}`}
              >
                <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-lg bg-primary-50/50">
                  <ProductImage
                    src={p.image_url}
                    alt={p.name}
                    rounded={false}
                    className="h-full w-full object-cover"
                    imgClassName="transition-transform duration-300 ease-out group-hover:scale-110"
                  />
                  {!outOfStock && (
                    <span className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white transition-all duration-150 group-hover:flex">
                      <Plus className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                  )}
                  {outOfStock && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/40">
                      <span className="rounded-full bg-danger-600 px-2.5 py-1 text-xs font-bold text-white">Stok Habis</span>
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <p className="line-clamp-2 text-sm font-medium text-slate-800 group-hover:text-primary-700 transition-colors">{p.name}</p>
                    <p className="text-xs text-slate-400/80">{p.sku}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <p className="text-sm font-bold text-primary-700 font-mono">{formatRupiah(p.sale_price)}</p>
                    <span
                      className={`pill ${
                        outOfStock
                          ? 'bg-danger-50 text-danger-600 ring-1 ring-danger-200/50'
                          : Number(p.stock) <= Number(p.min_stock)
                          ? 'bg-danger-50 text-danger-600 ring-1 ring-danger-200/50'
                          : Number(p.stock) <= Number(p.min_stock) * 1.5 && Number(p.min_stock) > 0
                          ? 'bg-warning-50 text-warning-700 ring-1 ring-warning-200/50'
                          : 'bg-slate-100/80 text-slate-500'
                      }`}
                    >
                      {formatQty(p.stock)}
                    </span>
                  </div>
                </div>
              </button>
              );
            })
          )}
        </div>
      </div>

      {/* ================= KANAN: keranjang ================= */}
      <div className="flex w-full flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm xl:w-[400px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ShoppingCart className="h-4 w-4 text-primary-600" />
            Keranjang
            {itemCount > 0 && <Badge color="bg-primary-100 text-primary-700">{formatNumber(itemCount)}</Badge>}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHeld(true)}
              title="Transaksi ditahan"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <PauseCircle className="h-5 w-5" />
              {cart.heldCarts.length > 0 && (
                <span className="absolute ml-2 mt-1 h-2 w-2 rounded-full bg-primary-600" />
              )}
            </button>
            <button
              onClick={() => cart.hold()}
              disabled={!cart.items.length}
              title="Hold transaksi"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <PlayCircle className="h-5 w-5" />
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={!cart.items.length}
              title="Kosongkan keranjang"
              className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Customer */}
        <button
          onClick={() => setShowCustomer(true)}
          className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600"
        >
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {cart.customer ? cart.customer.name : 'Pelanggan umum'}
          </span>
          {cart.customer && (
            <span
              className="text-xs text-slate-400"
              onClick={(e) => {
                e.stopPropagation();
                cart.setCustomer(null);
              }}
            >
              hapus
            </span>
          )}
        </button>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cart.items.length === 0 ? (
            <EmptyState
              title="Keranjang kosong"
              description="Klik produk atau scan barcode untuk menambahkan"
              action={<Package className="h-10 w-10 text-slate-300" />}
            />
          ) : (
            <ul className="space-y-2">
              {cart.items.map((item) => {
                const lineTotal = item.product.sale_price * item.quantity - item.discount;
                return (
                  <li key={item.product.id} className="rounded-xl border border-slate-200/80 p-2.5 transition-all duration-150 hover:border-slate-300/80 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProductImage src={item.product.image_url} alt={item.product.name} className="h-9 w-9 rounded-lg" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{item.product.name}</p>
                          <p className="text-xs text-slate-400/80">
                            {formatRupiah(item.product.sale_price)} / {item.product.unit?.short_name || 'pcs'}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => cart.remove(item.product.id)} className="rounded-lg p-1 text-slate-300 hover:bg-danger-50 hover:text-danger-500 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => cart.decrement(item.product.id)}
                          className="rounded-lg border border-slate-200 p-1 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                          aria-label="Kurangi jumlah"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => cart.setQuantity(item.product.id, e.target.value)}
                          className="w-14 rounded-lg border border-slate-200 py-1 text-center text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
                        />
                        <button
                          onClick={() => cart.increment(item.product.id)}
                          className="rounded-lg border border-slate-200 p-1 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                          aria-label="Tambah jumlah"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Percent className="h-3.5 w-3.5 text-slate-300" />
                        <input
                          type="number"
                          value={item.discount || ''}
                          placeholder="0"
                          onChange={(e) => cart.setItemDiscount(item.product.id, e.target.value)}
                          className="w-20 rounded-lg border border-slate-200 py-1 px-2 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
                          aria-label="Diskon item"
                        />
                      </div>
                      <p className="w-24 text-right text-sm font-bold text-slate-800 font-mono">{formatRupiah(lineTotal)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">Diskon transaksi</span>
            <div className="flex items-center gap-1">
              <Percent className="h-3.5 w-3.5 text-slate-300" />
              <input
                type="number"
                value={cart.discount || ''}
                placeholder="0"
                onChange={(e) => cart.setDiscount(e.target.value)}
                className="w-28 rounded-md border border-slate-300 py-1 px-2 text-right text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-slate-500">
              Pajak
              <button
                onClick={() => setTaxEnabled((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors ${taxEnabled ? 'bg-primary-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${taxEnabled ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </span>
            <span className="text-sm text-slate-700">{taxEnabled ? `${taxRate}%` : 'Nonaktif'}</span>
          </div>

          <div className="mb-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm font-medium text-slate-600">Total</span>
            <span className="text-2xl font-bold text-slate-900 font-mono">{formatRupiah(totals.total)}</span>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={!cart.items.length}
            onClick={() => setShowCheckout(true)}
          >
            <Banknote className="h-5 w-5" />
            Bayar (F8)
          </Button>
        </div>
      </div>

      {/* ================= MODALS ================= */}
      <CheckoutModal
        open={showCheckout}
        onClose={() => setShowCheckout(false)}
        totals={totals}
        taxEnabled={taxEnabled}
        taxRate={taxRate}
        taxAmount={taxAmount}
        additionalCost={additionalCost}
        setAdditionalCost={setAdditionalCost}
        paymentMethods={settings?.payment_methods || PAYMENT_METHODS}
        onConfirm={handleCheckout}
      />

      <CustomerModal
        open={showCustomer}
        onClose={() => setShowCustomer(false)}
        query={customerQuery}
        setQuery={setCustomerQuery}
        results={customerResults}
        generalCustomer={generalCustomer.data}
        onSelect={(c) => { cart.setCustomer(c); setShowCustomer(false); }}
      />

      <HeldCartsModal open={showHeld} onClose={() => setShowHeld(false)} heldCarts={cart.heldCarts} onResume={cart.resume} onRemove={cart.removeHeld} />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => { cart.clear(); setConfirmClear(false); }}
        title="Kosongkan keranjang?"
        message="Semua item di keranjang akan dihapus."
        confirmText="Ya, kosongkan"
      />

      <ReceiptModal open={showReceipt} onClose={() => setShowReceipt(false)} sale={lastSale} settings={settings} />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}

/* ============================================================
   CHECKOUT + PAYMENT
============================================================ */
function CheckoutModal({ open, onClose, totals, taxEnabled, taxRate, taxAmount, additionalCost, setAdditionalCost, paymentMethods, onConfirm }) {
  const [method, setMethod] = useState('CASH');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setPaid('');
      setNotes('');
      setError(null);
    }
  }, [open]);

  const paidNum = Number(paid) || 0;
  const change = computeChange(paidNum, totals.total);
  const paidValid = method === 'CASH' ? paidNum >= totals.total : true;
  const isCash = method === 'CASH';

  const submit = async () => {
    if (!paidValid) {
      setError('Jumlah bayar kurang dari total transaksi');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        payment_method: method,
        cash_received: isCash ? paidNum : null,
        notes: notes || null,
        tax: taxAmount,
        additional_cost: additionalCost || 0,
      });
    } catch (e) {
      setError(getErrorMessage(e, 'Transaksi gagal'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Checkout & Pembayaran"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button onClick={submit} loading={submitting} disabled={!paidValid}>
            <Banknote className="h-4 w-4" /> Proses Pembayaran
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">{formatRupiah(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span className="font-medium text-danger-600">-{formatRupiah(totals.discount)}</span></div>}
          {taxEnabled && <div className="flex justify-between"><span className="text-slate-500">Pajak ({taxRate}%)</span><span className="font-medium">{formatRupiah(taxAmount)}</span></div>}
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Biaya tambahan</span>
            <input
              type="number"
              min="0"
              value={additionalCost || ''}
              onChange={(e) => setAdditionalCost(Math.max(Number(e.target.value) || 0, 0))}
              className="w-28 rounded-lg border border-slate-200 py-1 px-2 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
            />
          </div>
          <div className="flex justify-between border-t border-slate-200/80 pt-2 text-base font-bold">
            <span>Grand Total</span>
            <span className="text-primary-700 font-mono">{formatRupiah(totals.total)}</span>
          </div>
        </div>

        <Field label="Metode Pembayaran">
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
                  method === m ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm shadow-primary-500/10' : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {paymentMethodLabel(m)}
              </button>
            ))}
          </div>
        </Field>

        {isCash && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jumlah Bayar" error={!paidValid ? 'Jumlah bayar kurang dari total transaksi' : ''}>
              <Input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" data-testid="cash-received" error={!paidValid} />
            </Field>
            <Field label="Kembalian">
              <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${change >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                {formatRupiah(Math.max(change, 0))}
              </div>
            </Field>
          </div>
        )}

        {!isCash && (
          <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-700">
            Pembayaran {paymentMethodLabel(method)} akan dikonfirmasi di perangkat pembayaran Anda.
          </div>
        )}

        <Field label="Catatan (opsional)">
          <Textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan transaksi..." />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

/* ============================================================
   PILIH PELANGGAN
============================================================ */
function CustomerModal({ open, onClose, query, setQuery, results, generalCustomer, onSelect }) {
  return (
    <Modal open={open} onClose={onClose} title="Pilih Pelanggan" size="md">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / nomor HP..." className="pl-9" autoFocus />
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          <button
            onClick={() => onSelect(generalCustomer || null)}
            className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-left text-sm text-slate-500 hover:border-primary-300 hover:text-primary-600 transition-all duration-150"
          >
            Pelanggan Umum
            <span className="block text-xs text-slate-400">Transaksi umum — tidak masuk bagi hasil 2,5%</span>
          </button>
          {results.loading ? (
            <div className="space-y-2 p-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : results.error ? (
            <ErrorState onRetry={results.reload} />
          ) : (results.data?.items || []).length === 0 ? (
            <EmptyState title="Pelanggan tidak ditemukan" />
          ) : (
            results.data.items.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 px-3 py-2.5 text-left text-sm hover:border-primary-300 hover:bg-primary-50/50 transition-all duration-150"
              >
                <div>
                  <p className="font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.phone || '-'}</p>
                </div>
                <User className="h-4 w-4 text-slate-300" />
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   TRANSAKSI DITAHAN (HOLD)
============================================================ */
function HeldCartsModal({ open, onClose, heldCarts, onResume, onRemove }) {
  return (
    <Modal open={open} onClose={onClose} title="Transaksi Ditahan" size="md">
      {heldCarts.length === 0 ? (
        <EmptyState title="Tidak ada transaksi ditahan" />
      ) : (
        <div className="space-y-2">
          {heldCarts.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 px-3 py-2.5 hover:border-slate-300/80 hover:shadow-sm transition-all duration-150">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {h.items.length} item · {formatQty(h.items.reduce((s, i) => s + i.quantity, 0))} pcs
                </p>
                <p className="text-xs text-slate-400/80">{formatDateTime(h.heldAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onResume(h.id)}>
                  <PlayCircle className="h-3.5 w-3.5" /> Lanjutkan
                </Button>
                <button onClick={() => onRemove(h.id)} className="rounded-lg p-1.5 text-danger-400 hover:bg-danger-50 hover:text-danger-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
