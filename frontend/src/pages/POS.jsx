import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, Users, PauseCircle, PlayCircle,
  Package, ScanLine, Banknote, X, Percent, Camera, AlertTriangle,
} from 'lucide-react';
import { productsApi, categoriesApi, customersApi, salesApi, settingsApi, cashierApi } from '../api/index.js';
import { useCartStore } from '../stores/cartStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useApi } from '../hooks/useApi.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { computeTotals, computeTax, computeChange } from '../utils/cart.js';
import { formatRupiah, formatNumber, formatQty, formatDateTime, formatDate, paymentMethodLabel, monoSizeClass } from '../utils/format.js';
import { Button } from '../components/ui/Button.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { Input, Select, Field, Textarea } from '../components/ui/Form.jsx';
import CurrencyInput from '../components/ui/CurrencyInput.jsx';
import { Skeleton, EmptyState, ErrorState, Badge } from '../components/ui/Feedback.jsx';
import BarcodeScanner from '../components/ui/BarcodeScanner.jsx';
import ReceiptModal from '../components/pos/ReceiptModal.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter.js';
import { usePrinterConnect } from '../context/PrinterConnectProvider.jsx';
import {
  seedOfflineCatalog,
  loadProductsOffline,
  loadCategoriesOffline,
  loadCustomersOffline,
  loadGeneralCustomerOffline,
  searchProductsOffline,
  refreshPelangganCache,
  getPelangganSyncedAt,
} from '../offline/catalog.js';
import {
  savePendingSale,
  countPendingSales,
  syncPendingSales,
  generateOfflineId,
} from '../offline/pendingSales.js';
import {
  buildPendingSale,
  isNetworkError,
  filterProductsLocal,
  filterCustomersLocal,
  findProductByCodeLocal,
  getSisaHutangOf,
  cacheAgeMinutes,
} from '../offline/pure.js';

const PAYMENT_METHODS = ['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'];

export default function POS() {
  const cart = useCartStore();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [categoryId, setCategoryId] = useState('');
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
  const [debtStats, setDebtStats] = useState(null);
  const pendingPrintRef = useRef(null);
  const searchRef = useRef(null);
  const bluetooth = useBluetoothPrinter();
  const { openConnectModal } = usePrinterConnect();

  // ---------- MODE OFFLINE ----------
  const online = useOnlineStatus();
  const user = useAuthStore((s) => s.user);
  const onlineRef = useRef(online);
  const wasOnlineRef = useRef(false);
  const syncingRef = useRef(false);
  const syncTimerRef = useRef(null);
  const [cachedProducts, setCachedProducts] = useState([]);
  const [cachedCategories, setCachedCategories] = useState([]);
  const [cachedCustomers, setCachedCustomers] = useState([]);
  const [cachedGeneral, setCachedGeneral] = useState(null);
  const [pelangganSyncedAt, setPelangganSyncedAt] = useState(null);

  const refreshCached = useCallback(() => {
    loadProductsOffline().then(setCachedProducts).catch(() => {});
    loadCategoriesOffline().then(setCachedCategories).catch(() => {});
    loadCustomersOffline().then(setCachedCustomers).catch(() => {});
    loadGeneralCustomerOffline().then(setCachedGeneral).catch(() => {});
    getPelangganSyncedAt().then(setPelangganSyncedAt).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCached();
  }, [refreshCached]);

  const products = useApi(
    () => {
      if (!online) return Promise.resolve({ items: [] });
      return productsApi.list({ search: debouncedSearch, category_id: categoryId || undefined, pageSize: 100, sort: 'name' }).then((r) => r.data);
    },
    [debouncedSearch, categoryId, online]
  );
  const categories = useApi(
    () => {
      if (!online) return Promise.resolve({ items: [] });
      return categoriesApi.list({ status: 'active' }).then((r) => r.data);
    },
    [online]
  );
  const customerResults = useApi(
    () => {
      if (!online) return Promise.resolve({ items: [] });
      return customersApi.list({ search: debouncedCustomer, is_general: 'false', pageSize: 10 }).then((r) => r.data);
    },
    [debouncedCustomer, online]
  );
  // Pelanggan default: "Pelanggan Umum" (tidak masuk perhitungan bagi hasil 2,5%)
  const generalCustomer = useApi(
    () => {
      if (!online) return Promise.resolve(null);
      return customersApi.list({ is_general: 'true', pageSize: 1 }).then((r) => r.data?.items?.[0] || null);
    },
    [online]
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
  // (gunanya data cache saat offline karena request API tidak bisa berjalan)
  useEffect(() => {
    const target = online ? generalCustomer.data : cachedGeneral;
    if (target && !cart.customer) {
      cart.setCustomer(target);
    }
  }, [generalCustomer.data, cachedGeneral, online, cart.customer, cart.setCustomer]);

  // ---------- TAMPILAN PRODUK (online = API / offline = cache lokal) ----------
  const reloadProductsRef = useRef(products.reload);
  reloadProductsRef.current = products.reload;

  const displayProducts = useMemo(() => {
    if (online) {
      return {
        loading: products.loading,
        error: products.error,
        items: products.data?.items || [],
        reload: reloadProductsRef.current,
      };
    }
    return {
      loading: false,
      error: null,
      items: filterProductsLocal(cachedProducts, { search: debouncedSearch, categoryId, limit: 100 }),
      reload: () => {},
    };
  }, [online, products.loading, products.error, products.data, cachedProducts, debouncedSearch, categoryId]);

  const displayCategories = useMemo(
    () => (online ? (categories.data?.items || []) : cachedCategories),
    [online, categories.data, cachedCategories]
  );

  const displayCustomerResults = useMemo(() => {
    if (online) return customerResults;
    return {
      loading: false,
      error: null,
      data: { items: filterCustomersLocal(cachedCustomers, { search: debouncedCustomer, limit: 10 }) },
      reload: () => {},
    };
  }, [online, customerResults, cachedCustomers, debouncedCustomer]);

  // ---------- SINKRONISASI OTOMATIS saaat kembali online ----------
  const scheduleSyncRetry = useCallback(() => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (onlineRef.current) handleReconnectRef.current();
    }, 30000);
  }, []);

  const seedAndRefresh = useCallback(async () => {
    await seedOfflineCatalog().catch(() => {});
    await refreshCached();
    reloadProductsRef.current?.();
  }, [refreshCached]);

  const handleReconnect = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const hasPending = (await countPendingSales()) > 0;
      if (hasPending) toast.info('Internet terhubung, menyinkronkan data...');
      const result = hasPending ? await syncPendingSales() : { synced: 0, failed: 0, networkError: false };
      if (result.synced > 0) toast.success(`${result.synced} transaksi offline berhasil disinkronkan`);
      window.dispatchEvent(new CustomEvent('pos:pending-changed'));
      await seedAndRefresh();
      if (result.networkError || result.failed > 0) scheduleSyncRetry();
    } catch {
      toast.error('Sinkronisasi gagal. Akan dicoba lagi otomatis.');
      scheduleSyncRetry();
    } finally {
      syncingRef.current = false;
    }
  }, [scheduleSyncRetry, seedAndRefresh]);

  const handleReconnectRef = useRef(handleReconnect);
  handleReconnectRef.current = handleReconnect;

  useEffect(() => {
    onlineRef.current = online;
    if (online && !wasOnlineRef.current) {
      handleReconnectRef.current();
    }
    wasOnlineRef.current = online;
  }, [online]);

  useEffect(() => () => clearTimeout(syncTimerRef.current), []);

  // Muat statistik hutang pelanggan terdaftar (bukan Umum)
  const loadDebtStats = useCallback(async () => {
    if (cart.customer?.id && !cart.customer?.is_general) {
      try {
        const r = await customersApi.debtStats(cart.customer.id);
        setDebtStats(r.data);
      } catch {
        setDebtStats(null);
      }
    } else {
      setDebtStats(null);
    }
  }, [cart.customer?.id, cart.customer?.is_general]);

  useEffect(() => {
    loadDebtStats();
  }, [loadDebtStats]);

  const taxAmount = useMemo(() => {
    if (!taxEnabled) return 0;
    const { subtotal, discount } = computeTotals(cart.items, cart.discount);
    return computeTax(subtotal - discount, taxRate);
  }, [cart.items, cart.discount, taxEnabled, taxRate]);

  const totals = useMemo(
    () => computeTotals(cart.items, cart.discount, taxAmount, additionalCost),
    [cart.items, cart.discount, taxAmount, additionalCost]
  );

  // Keyboard shortcuts: F2/F3 fokus kolom pencarian, F4 pelanggan, F8 bayar, +/- ubah qty
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2' || e.key === 'F3') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowCustomer(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        const items = useCartStore.getState().items;
        if (items.length) setShowCheckout(true);
      } else if ((e.key === '+' || e.key === '=') && !(e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable))) {
        const last = useCartStore.getState().items[useCartStore.getState().items.length - 1];
        if (last) useCartStore.getState().increment(last.product.id);
      } else if (e.key === '-' && !(e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable))) {
        const last = useCartStore.getState().items[useCartStore.getState().items.length - 1];
        if (last) useCartStore.getState().decrement(last.product.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const addToCartIfAvailable = useCallback((product) => {
    if (!product) {
      toast.error('Produk tidak ditemukan');
      return false;
    }
    if (Number(product.stock) <= 0) {
      toast.error(`${product.name} stok habis`);
      return false;
    }
    const added = cart.add(product);
    if (!added) {
      toast.error(`Stok ${product.name} tidak cukup`);
      return false;
    }
    toast.success(`${product.name} ditambahkan`);
    return true;
  }, [cart]);

  const addProductByCode = useCallback(async (code) => {
    if (!code) return;
    try {
      if (!online) {
        addToCartIfAvailable(findProductByCodeLocal(cachedProducts, code));
      } else {
        const res = await productsApi.byBarcode(code);
        addToCartIfAvailable(res.data);
      }
    } catch {
      toast.error('Produk tidak ditemukan');
    }
    setSearch('');
    searchRef.current?.focus();
  }, [addToCartIfAvailable, online, cachedProducts]);

  // Auto-add via ENTER (full keyboard, tanpa mouse):
  // 1) Ketikan angka semua → prioritas cocok barcode presisi (scan tetap
  //    normal); kalau tidak ada, lanjut ke hasil pencarian pertama.
  // 2) Ketikan teks/SKU → tambahkan produk paling atas dari hasil pencarian
  //    nama/SKU/barcode (case-insensitive).
  const addFirstMatchingProduct = useCallback(async (query) => {
    if (!online) {
      if (/^[0-9]+$/.test(query)) {
        const exact = findProductByCodeLocal(cachedProducts, query);
        if (exact && addToCartIfAvailable(exact)) return;
      }
      const first = searchProductsOffline(cachedProducts, { search: query, categoryId, limit: 1 })[0];
      addToCartIfAvailable(first);
      return;
    }
    if (/^[0-9]+$/.test(query)) {
      try {
        const res = await productsApi.byBarcode(query);
        if (addToCartIfAvailable(res.data)) return;
      } catch {
        // barcode presisi tidak ditemukan → lanjut lewat pencarian
      }
    }
    try {
      const res = await productsApi.list({
        search: query,
        category_id: categoryId || undefined,
        pageSize: 100,
        sort: 'name',
      });
      addToCartIfAvailable(res.data?.items?.[0]);
    } catch {
      toast.error('Produk tidak ditemukan');
    }
  }, [addToCartIfAvailable, categoryId, online, cachedProducts]);

  const handleScan = useCallback((code) => {
    setScannerOpen(false);
    addProductByCode(code);
  }, [addProductByCode]);

  const printStrukAfterSale = useCallback((sale) => {
    // Printer Bluetooth = cetak struk otomatis selalu (auto-connect bila perlu).
    if (!bluetooth.supported || !sale) return;
    bluetooth
      .printStruk(sale, settings?.store, settings?.pos)
      .catch(() => {
        setShowReceipt(false);
        pendingPrintRef.current = { sale, store: settings?.store, pos: settings?.pos };
        openConnectModal({
          title: 'Printer Tidak Terhubung',
          message: 'Gagal mencetak struk. Silakan aktifkan Bluetooth dan pilih printer thermal Anda.',
          connectLabel: 'Hubungkan & Cetak Ulang',
          onClose: () => setShowReceipt(true),
          onConnected: async () => {
            const data = pendingPrintRef.current;
            pendingPrintRef.current = null;
            if (!data) return;
            try {
              await bluetooth.printStruk(data.sale, data.store, data.pos);
              toast.success('Struk berhasil dicetak');
            } catch {
              toast.error('Gagal mencetak struk. Silakan coba lagi.');
            }
          },
        });
      });
  }, [bluetooth, settings?.store, settings?.pos, openConnectModal]);

  // Simpan transaksi OFF-LINE ke IndexedDB (antrean sinkronisasi).
  const saveOfflineTransaction = useCallback(async (payload) => {
    const items = cart.items.map((i) => ({
      product_id: i.product.id,
      quantity: i.quantity,
      price: i.product.sale_price,
      discount: i.discount || 0,
    }));
    const fullPayload = {
      ...payload,
      items,
      customer_id: cart.customer?.id || null,
      session_id: sessionId || null,
      discount: Number(cart.discount) || 0,
    };
    const offlineId = generateOfflineId();
    const record = buildPendingSale({ cart, payload: fullPayload, totals, user, offlineId });
    await savePendingSale(record);
    window.dispatchEvent(new CustomEvent('pos:pending-changed'));
    toast.success('Transaksi disimpan secara offline');
    setLastSale(record.sale);
    cart.clear();
    setShowCheckout(false);
    setShowReceipt(true);
    loadDebtStats();
    printStrukAfterSale(record.sale);
  }, [cart, sessionId, totals, user, loadDebtStats, printStrukAfterSale]);

  const handleCheckout = async (payload) => {
    // Auto-konek printer Bluetooth: jika belum ada printer tersimpan,
    // dialog pairing browser langsung muncul (masih dalam konteks klik user).
    // Gagal/batal tidak menggagalkan transaksi — cukup tanpa cetak otomatis.
    if (bluetooth.supported && !bluetooth.isConnected && !bluetooth.hasStoredDevice) {
      await bluetooth.connect().catch(() => {});
    }
    // OFF-LINE: simpan ke antrean lokal, tanpa hit server (tidak menunggu timeout).
    if (!online) {
      await saveOfflineTransaction(payload);
      return;
    }
    // Kirim item keranjang ke API (product_id, qty, harga, diskon)
    const items = cart.items.map((i) => ({
      product_id: i.product.id,
      quantity: i.quantity,
      price: i.product.sale_price,
      discount: i.discount || 0,
    }));
    const fullPayload = {
      ...payload,
      items,
      customer_id: cart.customer?.id || null,
      session_id: sessionId || null,
      discount: Number(cart.discount) || 0,
    };
    try {
      const res = await salesApi.create(fullPayload);
      // Hutang dicatat atomik di dalam fn_create_sale (server) dari record_debt
      const saleCustomerId = cart.customer?.id;
      if (payload.record_debt && saleCustomerId) {
        toast.success(`Hutang ${formatRupiah(payload.record_debt.amount)} berhasil dicatat`);
      }
      setLastSale(res.data.sale);
      cart.clear();
      setShowCheckout(false);
      setShowReceipt(true);
      // Refresh data hutang & daftar pelanggan agar info hutang selalu terbaru
      loadDebtStats();
      customerResults.reload();
      // Transaksi hutang baru sukses → sinkronkan ulang cache pelanggan lokal
      // agar sisa hutang di IndexedDB tidak basi
      if (payload.record_debt && saleCustomerId) {
        await refreshPelangganCache();
        await refreshCached();
      }
      printStrukAfterSale(res.data.sale);
    } catch (error) {
      // Jaringan putus di tengah proses → alihkan ke penyimpanan offline
      if (isNetworkError(error)) {
        await saveOfflineTransaction(payload);
        return;
      }
      toast.error(getErrorMessage(error, 'Transaksi gagal'));
      throw error;
    }
  };

  const itemCount = cart.itemCount();

  return (
    <div className="relative flex h-full flex-col gap-4 xl:h-[calc(100vh-6.5rem)] xl:flex-row">
      {/* ================= PRODUCTS SECTION ================= */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border-2 border-black bg-white p-4 shadow-sm xl:p-5">
        <div className="space-y-3">
          {/* Search & Scan Barcode — satu kolom */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const q = search.trim();
                  if (!q) return;
                  addFirstMatchingProduct(q).finally(() => {
                    setSearch('');
                    searchRef.current?.focus();
                  });
                }
              }}
              placeholder="Cari produk atau Scan Barcode (F2)..."
              aria-label="Cari produk atau scan barcode"
              className="w-full rounded-lg border-2 border-black bg-white py-3 pl-11 pr-12 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-200"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              <ScanLine className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                title="Scan barcode (kamera)"
                aria-label="Scan barcode dengan kamera"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-all duration-200 hover:bg-primary-50 hover:text-primary-600"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="hidden shrink-0 text-xs font-medium text-slate-500 sm:inline">
              {displayProducts.items.length} produk
            </span>
            <div className="h-4 w-px shrink-0 bg-slate-200 sm:block" />
            <button
              onClick={() => setCategoryId('')}
              className={`shrink-0 rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                !categoryId
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            {(displayCategories).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                className={`shrink-0 rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
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
        <div className="grid flex-1 min-h-0 grid-cols-2 content-start items-start gap-2 overflow-y-auto pb-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
          {displayProducts.loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-xl border-2 border-black bg-white"
              >
                <Skeleton className="aspect-square w-full rounded-t-2xl" />
                <div className="flex flex-1 flex-col gap-1 p-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="mt-auto h-8 w-full rounded-lg" />
                </div>
              </div>
            ))
          ) : displayProducts.error ? (
            <div className="col-span-full">
              <ErrorState onRetry={displayProducts.reload} />
            </div>
          ) : !displayProducts.items.length ? (
            <div className="col-span-full">
              <EmptyState
                title={!online ? 'Katalog belum tersedia di perangkat' : 'Produk tidak ditemukan'}
                description={!online ? 'Hubungkan internet sekali untuk menyimpan katalog, lalu kasir tetap bisa berjalan tanpa koneksi.' : null}
              />
            </div>
          ) : (
            displayProducts.items.map((p) => {
              const outOfStock = Number(p.stock) <= 0;
              const inactive = p.status !== 'active';
              const disabled = inactive || outOfStock;
              const lowStock = !outOfStock && Number(p.stock) <= Number(p.min_stock || 0);
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
                  className={`group relative flex cursor-pointer flex-col rounded-xl border-2 bg-white text-left shadow-sm transition-all duration-200 ${
                    qty > 0
                      ? 'border-primary-400 ring-2 ring-primary-200/60'
                      : 'border-black hover:-translate-y-0.5 hover:border-black hover:shadow-lg'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {/* Product Image */}
                  <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-t-xl bg-slate-50">
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
                    {qty > 0 && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white shadow-md">
                        {qty}
                      </span>
                    )}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                        <span className="rounded-full bg-danger-600 px-2.5 py-0.5 text-[10px] font-bold text-white">Stok Habis</span>
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex flex-col gap-1 px-2 py-2">
                    <p className="line-clamp-2 min-h-[2rem] text-[11px] font-semibold leading-tight text-slate-800 transition-colors group-hover:text-primary-700 sm:text-xs">
                      {p.name}
                    </p>
                    <p className="truncate text-xs font-bold text-primary-700 font-mono sm:text-sm">
                      {formatRupiah(p.sale_price)}
                    </p>
                    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold sm:text-[10px] ${
                      inactive ? 'bg-slate-100 text-slate-500'
                        : outOfStock ? 'bg-danger-50 text-danger-600'
                        : lowStock ? 'bg-warning-50 text-warning-700'
                        : 'bg-success-50 text-success-700'
                    }`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                        inactive ? 'bg-slate-400' : outOfStock ? 'bg-danger-500' : lowStock ? 'bg-warning-500' : 'bg-success-500'
                      }`} />
                      {inactive ? 'Nonaktif' : outOfStock ? 'Habis' : formatQty(p.stock)}
                    </span>
                    <div className="pt-1.5">
                      {qty > 0 ? (
                        <div onClick={stop} className="grid h-8 grid-cols-[2rem_1fr_2rem] items-stretch overflow-hidden rounded-md border-2 border-black bg-white shadow-sm">
                          <button type="button" onClick={handleDec} className="flex items-center justify-center bg-white text-primary-700 transition-colors hover:bg-primary-50 active:bg-primary-100" aria-label={`Kurangi ${p.name}`}>
                            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                          <span className="flex items-center justify-center border-x border-primary-200 bg-primary-50 text-center text-xs font-bold font-mono text-primary-700">{qty}</span>
                          <button type="button" onClick={handleInc} disabled={qty >= Number(p.stock)} className="flex items-center justify-center bg-primary-600 text-white transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-300" aria-label={`Tambah ${p.name}`}>
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : disabled ? (
                        <div className="flex h-8 w-full items-center justify-center rounded-md bg-slate-100 text-[10px] font-medium text-slate-400">
                          {inactive ? 'Nonaktif' : 'Habis'}
                        </div>
                      ) : (
                        <button type="button" onClick={handleAdd} aria-label={`Tambah ${p.name} ke keranjang`} title={`Tambah ${p.name}`}
                          className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-primary-500 text-white text-[11px] font-semibold shadow-sm transition-all duration-200 hover:from-primary-600 hover:to-primary-700 hover:shadow-md active:scale-[0.98]">
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          <span>Tambah</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Info shortcut — di pojok bawah area produk, tidak menutupi grid */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-black pt-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Shortcut:</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">F2</kbd> Cari / Scan</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">F4</kbd> Pelanggan</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">F8</kbd> Bayar</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">-</kbd>/<kbd className="kbd">+</kbd> Ubah Qty</span>
        </div>
      </div>

      {/* ================= CART SECTION ================= */}
      <div className="flex w-full flex-col rounded-xl border-2 border-black bg-white shadow-sm xl:w-[480px] 2xl:w-[520px]">
        <div className="flex items-center justify-between border-b-2 border-black px-5 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ShoppingCart className="h-6 w-6 text-primary-600" />
            Keranjang
            {itemCount > 0 && (
              <Badge color="bg-primary-600 text-white px-3 py-0.5 text-sm">
                {formatNumber(itemCount)}
              </Badge>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHeld(true)}
              title="Transaksi ditahan"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-primary-600 transition-colors"
            >
              <PauseCircle className="h-5 w-5" />
              {cart.heldCarts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
                  {cart.heldCarts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => cart.hold()}
              disabled={!cart.items.length}
              title="Hold transaksi"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <PlayCircle className="h-5 w-5" />
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={!cart.items.length}
              title="Kosongkan keranjang"
              className="rounded-md p-2 text-slate-500 hover:bg-danger-50 hover:text-danger-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Customer Section */}
        <div className="px-5 py-3.5">
          <button
            onClick={() => setShowCustomer(true)}
            className="w-full flex items-center justify-between rounded-lg border-2 border-black bg-slate-50 px-4 py-3 transition-all duration-200 hover:border-primary-400 hover:bg-primary-50/30"
          >
              <span className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-sm">
                <Users className="h-5 w-5 text-slate-500" />
              </div>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800 truncate">
                  {cart.customer ? cart.customer.name : 'Pelanggan umum'}
                </span>
                {cart.customer && !cart.customer.is_general && debtStats && Number(debtStats.pending_debt || 0) > 0 && (
                  <span className="block text-xs font-medium text-amber-600 mt-0.5">
                    Hutang: {formatRupiah(debtStats.pending_debt)}
                  </span>
                )}
              </span>
            </span>
            {cart.customer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cart.setCustomer(null);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-50 hover:text-danger-700 transition-colors"
              >
                Ganti
              </button>
            )}
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
                <Package className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-semibold text-slate-700">Keranjang kosong</h4>
              <p className="mt-1 text-xs text-slate-500 text-center max-w-[200px]">
                Klik produk atau scan barcode untuk menambahkan item
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {cart.items.map((item) => {
                const lineTotal = item.product.sale_price * item.quantity - item.discount;
                return (
                  <li
                    key={item.product.id}
                    className="group rounded-lg border-2 border-black bg-white p-3 shadow-sm transition-all duration-200 hover:border-primary-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                          <div className="relative flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
                          <ProductImage
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="h-12 w-12 rounded-md"
                            fit="cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-primary-700">
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
                        className="flex-shrink-0 rounded-md p-1.5 text-slate-300 hover:bg-danger-50 hover:text-danger-600 transition-colors"
                        aria-label="Hapus item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-black pt-3">
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => cart.decrement(item.product.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-black transition-colors hover:bg-slate-50 hover:text-primary-600 active:bg-slate-100"
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
                          className="w-16 rounded-md border-2 border-black bg-white py-1.5 text-center text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all duration-150"
                          aria-label="Jumlah"
                        />
                        <button
                          onClick={() => cart.increment(item.product.id)}
                          disabled={item.quantity >= Number(item.product.stock)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-black transition-colors hover:bg-slate-50 hover:text-primary-600 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Tambah jumlah"
                        >
                          <Plus className="h-4 w-4 text-slate-600" />
                        </button>
                      </div>

                      {/* Item Discount */}
                      <div className="flex items-center gap-1.5">
                        <Percent className="h-4 w-4 text-slate-300" />
                        <CurrencyInput
                          value={item.discount || 0}
                          onChange={(num) => cart.setItemDiscount(item.product.id, num)}
                          placeholder="0"
                          className="w-24 text-right"
                          aria-label="Diskon item"
                        />
                      </div>

                      {/* Line Total */}
                      <div className="flex-shrink-0 w-32 text-right">
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
        <div className="border-t-2 border-black px-5 py-5 space-y-3.5 bg-slate-50/50">
          {/* Transaction Discount */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 font-medium">Diskon transaksi</span>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <CurrencyInput
                value={cart.discount || 0}
                onChange={(num) => cart.setDiscount(num)}
                className="w-32 pl-8 pr-3 py-2 text-right text-sm font-semibold"
                placeholder="0"
              />
            </div>
          </div>

          {/* Tax Toggle */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-medium">Pajak</span>
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
            <span className="font-semibold text-slate-700">
              {taxEnabled ? `${taxRate}%` : 'Nonaktif'}
            </span>
          </div>

          {/* Subtotal/Total Breakdown */}
          <div className="space-y-2 border-t-2 border-black pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold text-slate-800 font-mono">
                {formatRupiah(totals.subtotal)}
              </span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Diskon</span>
                <span className="font-semibold text-danger-600 font-mono">
                  -{formatRupiah(totals.discount)}
                </span>
              </div>
            )}
            {taxEnabled && taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Pajak ({taxRate}%)</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {formatRupiah(taxAmount)}
                </span>
              </div>
            )}
            {additionalCost > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Biaya tambahan</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {formatRupiah(additionalCost)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-300 pt-3 gap-3">
              <span className="text-slate-900 font-bold">Grand Total</span>
              <span className={`text-primary-700 font-mono ${monoSizeClass(formatRupiah(totals.total))} truncate`} title={formatRupiah(totals.total)}>
                {formatRupiah(totals.total)}
              </span>
            </div>
          </div>

          {/* Additional Cost Input */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 font-medium">Biaya tambahan</span>
            <CurrencyInput
              value={additionalCost || 0}
              onChange={(num) => setAdditionalCost(Math.max(Number(num) || 0, 0))}
              className="w-36 text-right"
            />
          </div>

          {/* Checkout Button */}
          <Button
            size="lg"
            className="w-full bg-primary-500 shadow-md hover:shadow-lg active:scale-[0.98]"
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
        customer={cart.customer}
        debtStats={debtStats}
      />

      <CustomerModal
        open={showCustomer}
        onClose={() => setShowCustomer(false)}
        query={customerQuery}
        setQuery={setCustomerQuery}
        results={displayCustomerResults}
        generalCustomer={online ? generalCustomer.data : cachedGeneral}
        online={online}
        pelangganSyncedAt={pelangganSyncedAt}
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
function CheckoutModal({ open, onClose, totals, taxEnabled, taxRate, taxAmount, additionalCost, setAdditionalCost, paymentMethods, onConfirm, customer, debtStats }) {
  const [method, setMethod] = useState('CASH');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showDebtDueDate, setShowDebtDueDate] = useState(false);
  const [debtDueDate, setDebtDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [debtNotes, setDebtNotes] = useState('');

  const paidNum = Number(paid) || 0;
  const change = computeChange(paidNum, totals.total);
  const isCash = method === 'CASH';

  // Pelanggan yang valid untuk hutang (terdaftar & bukan Umum)
  const validDebtCustomer = customer?.id && !customer?.is_general;

  // Hitung hutang: cash kurang
  const debtAmount = (isCash && paidNum < totals.total)
    ? Math.max(0, totals.total - paidNum)
    : 0;
  const canRecordDebt = debtAmount > 0 && validDebtCustomer;

  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setPaid(String(totals.total));
      setNotes('');
      setError(null);
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setDebtDueDate(d.toISOString().split('T')[0]);
      setDebtNotes('');
    }
  }, [open, customer?.id]);

  // Tombol bisa diklik jika:
  // - CASH: bayar cukup ATAU pelanggan terdaftar (rekam hutang)
  // - Non-cash: otomatis terverifikasi, selama ada item di keranjang
  const canSubmit = isCash
    ? (paidNum >= totals.total || canRecordDebt)
    : (totals.total > 0);

  const handleSelectMethod = (m) => {
    setMethod(m);
    if (m === 'CASH') setPaid(String(totals.total));
  };

  const submit = async () => {
    if (isCash) {
      const isShort = paidNum < totals.total;
      if (isShort && !validDebtCustomer) {
        setError('Jumlah bayar kurang dari total. Pilih pelanggan terdaftar untuk mencatat hutang, atau lengkapi pembayaran.');
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        payment_method: method,
        cash_received: isCash && paidNum > 0 ? paidNum : null,
        notes: notes || null,
        tax: taxAmount,
        additional_cost: additionalCost || 0,
      };
      // Otomatis catat hutang jika bayar kurang & pelanggan terdaftar
      if (canRecordDebt && paidNum < totals.total) {
        payload.record_debt = {
          amount: debtAmount,
          due_date: debtDueDate,
          notes: debtNotes || null,
        };
      }
      await onConfirm(payload);
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
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={submit}
                loading={submitting}
                disabled={!canSubmit}
                className="px-6"
              >
                <Banknote className="h-5 w-5" />
                {isCash && canRecordDebt ? `Bayar ${formatRupiah(paidNum)} · Hutang ${formatRupiah(debtAmount)}` : 'Proses Pembayaran'}
              </Button>
              {isCash && !canSubmit && (
                <p className="text-xs font-medium text-danger-600">Mohon isi Jumlah Bayar terlebih dahulu</p>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Order Summary */}
        <div className="space-y-4 rounded-lg border-2 border-black bg-white p-4">
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
              <CurrencyInput
                value={additionalCost || 0}
                onChange={(num) => setAdditionalCost(Math.max(Number(num) || 0, 0))}
                className="w-32 text-right"
              />
            </div>
            <div className="flex justify-between border-t-2 border-black pt-3 mt-1 gap-3">
              <span className="font-semibold text-slate-900">Grand Total</span>
              <span className={`font-bold text-primary-700 font-mono ${monoSizeClass(formatRupiah(totals.total))} truncate`} title={formatRupiah(totals.total)}>
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
                onClick={() => handleSelectMethod(m)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-all duration-200 ${
                  method === m
                    ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-200'
                    : 'border-black text-slate-700 hover:border-primary-300 hover:bg-primary-50/50 hover:text-primary-600'
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
          <div className="space-y-3 rounded-lg border-2 border-black bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">Pembayaran Tunai</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Jumlah Bayar
                  {paidNum < totals.total && (
                    <span className={`ml-1 text-xs font-normal ${canRecordDebt ? 'text-amber-600' : 'text-danger-600'}`}>
                      {canRecordDebt ? `(sisa ${formatRupiah(totals.total - paidNum)} → hutang)` : `(kurang ${formatRupiah(totals.total - paidNum)})`}
                    </span>
                  )}
                </label>
                 <div className="relative">
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-500">Rp</div>
                   <CurrencyInput
                     value={paidNum}
                     onChange={(value) => setPaid(String(value))}
                     placeholder="0"
                     className="pl-10 text-lg"
                     error={paidNum < totals.total && !canRecordDebt}
                     autoFocus
                   />
                 </div>
                <div className="flex gap-2 mt-2">
                  {[50000, 100000, totals.total].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setPaid(String(amount))}
                      className="rounded-md border-2 border-black px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors"
                    >
                      {formatRupiah(amount)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Kembalian</label>
                <div className={`rounded-md border p-3 text-center transition-all duration-200 ${
                  change >= 0
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-red-300 bg-red-50 text-red-700'
                }`}>
                  <div className={`${monoSizeClass(change >= 0 ? formatRupiah(change) : formatRupiah(Math.abs(change)))} font-bold font-mono truncate`} title={change >= 0 ? formatRupiah(change) : formatRupiah(Math.abs(change))}>
                    {change >= 0 ? formatRupiah(change) : formatRupiah(Math.abs(change))}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {change >= 0 ? 'Kembalian kepada pelanggan' : 'Kurang bayar'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hutang pelanggan - tampil jika ada */}
        {customer?.id && debtStats && Number(debtStats.pending_debt || 0) > 0 && (
          <div className="rounded-lg border-2 border-black bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <h5 className="text-sm font-semibold text-amber-800">Hutang Berjalan</h5>
                <p className="mt-0.5 text-sm text-amber-700">
                  Hutang yang perlu dilunasi: <b>{formatRupiah(debtStats.pending_debt)}</b>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Non-Cash Payment Message */}
        {!isCash && (
          <div className="rounded-lg border-2 border-black bg-blue-50 p-4">
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

        {/* Info hutang otomatis (bayar kurang) — pelanggan terdaftar, tidak perlu centang */}
        {isCash && customer?.id && !customer?.is_general && debtAmount > 0 && (
          <div className="rounded-lg border-2 border-black bg-amber-50/50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Sisa otomatis dicatat sebagai hutang</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  <b>{formatRupiah(debtAmount)}</b> akan ditagih ke <b>{customer?.name}</b> dengan jatuh tempo {formatDate(debtDueDate)}.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDebtDueDate((v) => !v)}
                    className="text-xs font-medium text-amber-700 underline hover:text-amber-800"
                  >
                    {showDebtDueDate ? 'Sembunyikan' : 'Ubah jatuh tempo'}
                  </button>
                </div>
                {showDebtDueDate && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="date"
                      value={debtDueDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setDebtDueDate(e.target.value)}
                      className="w-full rounded-md border-2 border-black px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <input
                      type="text"
                      value={debtNotes}
                      onChange={(e) => setDebtNotes(e.target.value)}
                      placeholder="Catatan (opsional)"
                      className="w-full rounded-md border-2 border-black px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      maxLength={500}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warning kalau cash kurang tapi tidak bisa hutang */}
        {isCash && debtAmount > 0 && !validDebtCustomer && (
          <div className="rounded-lg border-2 border-black bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-red-800">Tidak bisa catat hutang</h5>
                <p className="mt-0.5 text-xs text-red-700">
                  Pembayaran kurang <b>{formatRupiah(debtAmount)}</b>. Hutang hanya dapat dicatat untuk pelanggan terdaftar (bukan "Pelanggan Umum"). Pilih pelanggan terlebih dahulu atau lengkapi pembayaran.
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
          <div className="rounded-md border-2 border-black bg-red-50 p-3">
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
function CustomerModal({ open, onClose, query, setQuery, results, generalCustomer, onSelect, online, pelangganSyncedAt }) {
  // Label sumber data: online = live dari server, offline = cache lokal + umur terakhir sinkron
  const dataLabel = online ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Data: Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Data: Offline{' '}
      {pelangganSyncedAt
        ? `(update ${cacheAgeMinutes(pelangganSyncedAt)} menit lalu)`
        : '(belum tersinkron)'}
    </span>
  );
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

        {/* Data Source Indicator */}
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
          {dataLabel}
        </div>

        {/* Customer List */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {/* General Customer Option */}
          <button
            onClick={() => onSelect(generalCustomer || null)}
            className="w-full flex items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-left transition-all duration-200 hover:border-primary-400 hover:bg-primary-50/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100">
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
                className="w-full flex items-center justify-between rounded-lg border-2 border-black px-4 py-3 text-left transition-all duration-200 hover:border-primary-400 hover:bg-primary-50/50 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">{c.name}</p>
                    <p className="text-sm text-slate-500 truncate">{c.phone || '-'}</p>
                    {(() => {
                      const sisa = getSisaHutangOf(c);
                      return sisa > 0 ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-xs font-medium text-danger-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-danger-500" />
                          Hutang: {formatRupiah(sisa)}
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          LUNAS - {formatRupiah(0)}
                        </span>
                      );
                    })()}
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
              className="flex items-center justify-between rounded-lg border-2 border-black px-4 py-3 transition-all duration-200 hover:border-slate-300 hover:shadow-sm hover:bg-slate-50"
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
                  className="rounded-md p-1.5 text-danger-500 hover:bg-danger-50 hover:text-danger-700 transition-colors"
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
