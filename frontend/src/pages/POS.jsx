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
      {/* ================= PRODUCTS SECTION ================= */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {/* Search and Barcode Section */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari produk (F2)..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-200"
                />
              </div>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBarcode()}
                  placeholder="Scan barcode (F3)..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-200 sm:w-56"
                />
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  title="Scan barcode (kamera)"
                  aria-label="Scan barcode dengan kamera"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-all duration-200 hover:bg-primary-50 hover:text-primary-600"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-3 text-xs text-slate-500 lg:flex">
              <span className="flex items-center gap-1.5"><kbd className="kbd">F2</kbd> Cari</span>
              <span className="flex items-center gap-1.5"><kbd className="kbd">F3</kbd> Barcode</span>
              <span className="flex items-center gap-1.5"><kbd className="kbd">F4</kbd> Pelanggan</span>
              <span className="flex items-center gap-1.5"><kbd className="kbd">F8</kbd> Bayar</span>
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryId('')}
              className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                !categoryId 
                  ? 'bg-primary-600 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            {(categories.data?.items || []).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                  categoryId === c.id 
                    ? 'bg-primary-600 text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {products.loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))
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
              const inCart = cart.items.find((i) => i.product.id === p.id);
              const qty = inCart?.quantity || 0;
              const stop = (e) => e.stopPropagation();
              const handleAdd = (e) => {
                stop(e);
                if (disabled) {
                  if (outOfStock) toast.error(`${p.name} stok habis`);
                  return;
                }
                const ok = cart.add(p);
                if (!ok && outOfStock) toast.error(`${p.name} stok habis`);
                else if (!ok) toast.error(`Stok ${p.name} tidak cukup`);
              };
              const handleInc = (e) => {
                stop(e);
                const ok = cart.increment(p.id);
                if (!ok) toast.error(`Stok ${p.name} tidak cukup`);
              };
              const handleDec = (e) => {
                stop(e);
                cart.decrement(p.id);
              };
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onClick={handleAdd}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAdd(e);
                    }
                  }}
                  aria-disabled={disabled}
                  className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white text-left transition-all duration-300 ${
                    qty > 0 
                      ? 'border-primary-400 bg-primary-50/30 shadow-sm ring-1 ring-primary-200/50' 
                      : 'border-slate-200 hover:border-primary-300 hover:shadow-md'
                  } ${disabled ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}
                >
                  {/* Product Image */}
                  <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                    <div className="absolute inset-0 p-2">
                      <ProductImage
                        src={p.image_url}
                        alt={p.name}
                        rounded={false}
                        fit="contain"
                        className="h-full w-full"
                        imgClassName="transition-transform duration-500 ease-out group-hover:scale-110"
                      />
                    </div>
                    
                    {/* Quantity Badge */}
                    {qty > 0 && (
                      <span className="absolute left-2 top-2 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary-600 px-2 text-xs font-bold text-white shadow-lg">
                        {qty}
                      </span>
                    )}
                    
                    {/* Stock Status Overlay */}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70">
                        <span className="rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-bold text-white">
                          Stok Habis
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex flex-1 flex-col px-3 pb-3">
                    <div className="mb-3">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-800 group-hover:text-primary-700 transition-colors">
                        {p.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{p.sku}</p>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                      {/* Price */}
                      <p className="text-sm font-bold text-primary-700 font-mono">
                        {formatRupiah(p.sale_price)}
                      </p>

                      {/* Action Controls */}
                      {qty > 0 ? (
                        <div
                          onClick={stop}
                          className="flex items-center gap-1 rounded-lg border border-primary-300 bg-white p-1 shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={handleDec}
                            aria-label={`Kurangi ${p.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-primary-700 transition-colors hover:bg-primary-50 active:bg-primary-100"
                          >
                            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                          <span className="min-w-[2rem] text-center text-sm font-bold font-mono text-primary-700">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={handleInc}
                            disabled={qty >= Number(p.stock)}
                            aria-label={`Tambah ${p.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-white transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : disabled ? (
                        <span
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                            inactive
                              ? 'bg-slate-200 text-slate-500'
                              : outOfStock
                              ? 'bg-danger-100 text-danger-700 border border-danger-200'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {inactive ? 'Nonaktif' : formatQty(p.stock)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500 tabular-nums">
                            Stok {formatQty(p.stock)}
                          </span>
                          <button
                            type="button"
                            onClick={handleAdd}
                            aria-label={`Tambah ${p.name} ke keranjang`}
                            title={`Tambah ${p.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white shadow-md transition-all duration-200 hover:bg-primary-700 hover:shadow-lg active:scale-95 active:bg-primary-800"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ================= CART SECTION ================= */}
      <div className="flex w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm xl:w-[420px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <ShoppingCart className="h-5 w-5 text-primary-600" />
            Keranjang
            {itemCount > 0 && (
              <Badge color="bg-primary-100 text-primary-700 px-2.5 py-0.5 text-xs">
                {formatNumber(itemCount)}
              </Badge>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHeld(true)}
              title="Transaksi ditahan"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <PauseCircle className="h-5 w-5" />
              {cart.heldCarts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
                  {cart.heldCarts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => cart.hold()}
              disabled={!cart.items.length}
              title="Hold transaksi"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <PlayCircle className="h-5 w-5" />
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={!cart.items.length}
              title="Kosongkan keranjang"
              className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Customer Section */}
        <div className="mx-4 mt-3">
          <button
            onClick={() => setShowCustomer(true)}
            className="w-full flex items-center justify-between rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-all duration-200"
          >
            <span className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Users className="h-4 w-4 text-slate-500" />
              </div>
              <span className="font-medium text-slate-700">
                {cart.customer ? cart.customer.name : 'Pelanggan umum'}
              </span>
            </span>
            {cart.customer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cart.setCustomer(null);
                }}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
              >
                Hapus
              </button>
            )}
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {cart.items.length === 0 ? (
            <EmptyState
              title="Keranjang kosong"
              description="Klik produk atau scan barcode untuk menambahkan item"
              action={<Package className="h-12 w-12 text-slate-300" />}
            />
          ) : (
            <ul className="space-y-3">
              {cart.items.map((item) => {
                const lineTotal = item.product.sale_price * item.quantity - item.discount;
                return (
                  <li
                    key={item.product.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 transition-all duration-200 hover:border-slate-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <ProductImage
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="h-10 w-10 rounded-lg"
                            fit="cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {item.product.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatRupiah(item.product.sale_price)} /{' '}
                            {item.product.unit?.short_name || 'pcs'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => cart.remove(item.product.id)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-danger-50 hover:text-danger-500 transition-colors"
                        aria-label="Hapus item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => cart.decrement(item.product.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 transition-colors hover:bg-slate-50 active:bg-slate-100"
                          aria-label="Kurangi jumlah"
                        >
                          <Minus className="h-4 w-4 text-slate-600" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => cart.setQuantity(item.product.id, e.target.value)}
                          min="1"
                          max={Number(item.product.stock)}
                          className="w-14 rounded-lg border border-slate-200 py-1.5 text-center text-sm font-medium focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
                          aria-label="Jumlah"
                        />
                        <button
                          onClick={() => cart.increment(item.product.id)}
                          disabled={item.quantity >= Number(item.product.stock)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Tambah jumlah"
                        >
                          <Plus className="h-4 w-4 text-slate-600" />
                        </button>
                      </div>

                      {/* Item Discount */}
                      <div className="flex items-center gap-1.5">
                        <Percent className="h-4 w-4 text-slate-300" />
                        <input
                          type="number"
                          value={item.discount || ''}
                          placeholder="0"
                          onChange={(e) => cart.setItemDiscount(item.product.id, e.target.value)}
                          min="0"
                          className="w-20 rounded-lg border border-slate-200 py-1.5 px-2 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
                          aria-label="Diskon item"
                        />
                      </div>

                      {/* Line Total */}
                      <div className="flex-shrink-0 w-28 text-right">
                        <p className="text-sm font-bold text-slate-900 font-mono">
                          {formatRupiah(lineTotal)}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Cart Footer - Summary & Checkout */}
        <div className="border-t border-slate-200 px-4 py-4 space-y-4">
          {/* Transaction Discount */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Diskon transaksi</span>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  value={cart.discount || ''}
                  placeholder="0"
                  onChange={(e) => cart.setDiscount(e.target.value)}
                  className="w-28 rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
                />
              </div>
            </div>
          </div>

          {/* Tax Toggle */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Pajak</span>
              <button
                onClick={() => setTaxEnabled((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  taxEnabled ? 'bg-primary-600' : 'bg-slate-300'
                }`}
                aria-label={taxEnabled ? 'Nonaktifkan pajak' : 'Aktifkan pajak'}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                    taxEnabled ? 'left-5.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <span className="font-medium text-slate-700">
              {taxEnabled ? `${taxRate}%` : 'Nonaktif'}
            </span>
          </div>

          {/* Subtotal/Total Breakdown */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-800 font-mono">
                {formatRupiah(totals.subtotal)}
              </span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Diskon</span>
                <span className="font-medium text-danger-600 font-mono">
                  -{formatRupiah(totals.discount)}
                </span>
              </div>
            )}
            {taxEnabled && taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Pajak ({taxRate}%)</span>
                <span className="font-medium text-slate-800 font-mono">
                  {formatRupiah(taxAmount)}
                </span>
              </div>
            )}
            {additionalCost > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Biaya tambahan</span>
                <span className="font-medium text-slate-800 font-mono">
                  {formatRupiah(additionalCost)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold">
              <span className="text-slate-900">Grand Total</span>
              <span className="text-primary-700 font-mono text-xl">
                {formatRupiah(totals.total)}
              </span>
            </div>
          </div>

          {/* Additional Cost Input */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Biaya tambahan</span>
            <input
              type="number"
              min="0"
              value={additionalCost || ''}
              onChange={(e) => setAdditionalCost(Math.max(Number(e.target.value) || 0, 0))}
              className="w-32 rounded-lg border border-slate-200 py-1.5 px-3 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
            />
          </div>

          {/* Checkout Button */}
          <Button
            size="lg"
            className="w-full"
            disabled={!cart.items.length}
            onClick={() => setShowCheckout(true)}
          >
            <Banknote className="h-5 w-5" />
            Bayar (F8) - {formatRupiah(totals.total)}
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

      <HeldCartsModal
        open={showHeld}
        onClose={() => setShowHeld(false)}
        heldCarts={cart.heldCarts}
        onResume={cart.resume}
        onRemove={cart.removeHeld}
      />

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
   CHECKOUT MODAL - Enhanced Payment Processing
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
      title="Pembayaran & Checkout"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-sm text-slate-600 font-mono">
            Total: <span className="font-bold text-slate-900">{formatRupiah(totals.total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              onClick={submit}
              loading={submitting}
              disabled={!paidValid}
              className="px-6"
            >
              <Banknote className="h-5 w-5" />
              Proses Pembayaran
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Order Summary */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-900">Ringkasan Pesanan</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium font-mono">{formatRupiah(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Diskon</span>
                <span className="font-medium font-mono text-danger-600">-{formatRupiah(totals.discount)}</span>
              </div>
            )}
            {taxEnabled && taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Pajak ({taxRate}%)</span>
                <span className="font-medium font-mono">{formatRupiah(taxAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Biaya tambahan</span>
              <input
                type="number"
                min="0"
                value={additionalCost || ''}
                onChange={(e) => setAdditionalCost(Math.max(Number(e.target.value) || 0, 0))}
                className="w-32 rounded-lg border border-slate-200 py-1.5 px-3 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
              />
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 mt-1">
              <span className="font-semibold text-slate-900">Grand Total</span>
              <span className="text-xl font-bold text-primary-700 font-mono">
                {formatRupiah(totals.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Method Selection */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">Metode Pembayaran</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {paymentMethods.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200 ${
                  method === m
                    ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-200'
                    : 'border-slate-200 text-slate-700 hover:border-primary-300 hover:bg-primary-50/50 hover:text-primary-600'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  method === m ? 'bg-primary-100' : 'bg-slate-100'
                }`}>
                  <Banknote className={`h-5 w-5 ${
                    method === m ? 'text-primary-600' : 'text-slate-400'
                  }`} />
                </div>
                <span>{paymentMethodLabel(m)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cash Payment Input */}
        {isCash && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">Pembayaran Tunai</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Jumlah Bayar
                  {!paidValid && (
                    <span className="ml-1 text-xs font-normal text-danger-600">
                      (kurang {formatRupiah(totals.total - paidNum)})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-500">Rp</div>
                  <Input
                    type="number"
                    min="0"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                    placeholder="0"
                    className="pl-10 text-lg"
                    error={!paidValid}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[50000, 100000, totals.total].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setPaid(String(amount))}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors"
                    >
                      {formatRupiah(amount)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Kembalian</label>
                <div className={`rounded-lg border p-3 text-center transition-all duration-200 ${
                  change >= 0
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-red-300 bg-red-50 text-red-700'
                }`}>
                  <div className="text-2xl font-bold font-mono">
                    {formatRupiah(Math.max(change, 0))}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {change >= 0 ? 'Kembalian kepada pelanggan' : 'Kurang bayar'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Non-Cash Payment Message */}
        {!isCash && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                <Banknote className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-blue-800">
                  Pembayaran {paymentMethodLabel(method)}
                </h5>
                <p className="mt-1 text-sm text-blue-700">
                  Selesaikan pembayaran di perangkat {paymentMethodLabel(method)} Anda.
                  Transaksi akan otomatis dikonfirmasi setelah pembayaran berhasil.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Notes */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-900">Catatan Transaksi</label>
          <Textarea
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tambahkan catatan untuk transaksi ini (opsional)..."
            className="resize-none"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Maksimal 1000 karakter</span>
            <span>{notes.length}/1000</span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ============================================================
   CUSTOMER SELECTION MODAL
============================================================ */
function CustomerModal({ open, onClose, query, setQuery, results, generalCustomer, onSelect }) {
  return (
    <Modal open={open} onClose={onClose} title="Pilih Pelanggan" size="md">
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama atau nomor HP pelanggan..."
            className="pl-10"
            autoFocus
          />
        </div>

        {/* Customer List */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {/* General Customer Option */}
          <button
            onClick={() => onSelect(generalCustomer || null)}
            className="w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-left transition-all duration-200 hover:border-primary-400 hover:bg-primary-50/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <Users className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="font-medium text-slate-800">Pelanggan Umum</p>
              <p className="text-xs text-slate-500">Transaksi umum - tidak masuk perhitungan bagi hasil</p>
            </div>
          </button>

          {/* Loading State */}
          {results.loading && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}

          {/* Error State */}
          {results.error && (
            <ErrorState onRetry={results.reload} />
          )}

          {/* Empty State */}
          {!results.loading && !results.error && (results.data?.items || []).length === 0 && (
            <EmptyState title="Pelanggan tidak ditemukan" />
          )}

          {/* Customer Results */}
          {!results.loading && !results.error && (results.data?.items || []).length > 0 && (
            results.data.items.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-all duration-200 hover:border-primary-400 hover:bg-primary-50/50 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{c.name}</p>
                    <p className="text-sm text-slate-500">{c.phone || '-'}</p>
                  </div>
                </div>
                <div className="text-xs text-slate-400">Pilih</div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   HELD CARTS MODAL
============================================================ */
function HeldCartsModal({ open, onClose, heldCarts, onResume, onRemove }) {
  return (
    <Modal open={open} onClose={onClose} title="Transaksi Ditahan" size="md">
      {heldCarts.length === 0 ? (
        <EmptyState title="Tidak ada transaksi ditahan" />
      ) : (
        <div className="space-y-2">
          {heldCarts.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition-all duration-200 hover:border-slate-300 hover:shadow-sm hover:bg-slate-50"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800">
                  {h.items.length} item · {formatQty(h.items.reduce((s, i) => s + i.quantity, 0))} pcs
                </p>
                <p className="text-sm text-slate-500 mt-1">{formatDateTime(h.heldAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onResume(h.id)}
                  className="gap-2"
                >
                  <PlayCircle className="h-4 w-4" />
                  Lanjutkan
                </Button>
                <button
                  onClick={() => onRemove(h.id)}
                  className="rounded-lg p-1.5 text-danger-500 hover:bg-danger-50 hover:text-danger-700 transition-colors"
                >
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
