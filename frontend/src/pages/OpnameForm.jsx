import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, ClipboardCheck, Calculator, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, AlertTriangle, Package, Scan, Plus, Trash2, Search, Filter, ChevronRight, Home, BarChart3, FileText, Calendar, Users, Activity, TrendingUp as TrendingUpIcon, X as XIcon, Check as CheckIcon, Plus as PlusIcon, Minus as MinusIcon, Barcode } from 'lucide-react';
import { inventoryApi, productsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Card, Input, Field, Select, Textarea, SearchInput, ConfirmDialog, StatusBadge, Badge, StatCard, ProgressBar, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/index.jsx';
import { dateTimeInput, formatDateTime, formatQty, formatRupiah } from '../utils/format.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'not_started', label: 'Belum Mulai' },
  { value: 'in_progress', label: 'Sedang Berjalan' },
  { value: 'completed', label: 'Selesai' },
  { value: 'mismatch', label: 'Ada Selisih' },
];

const STATUS_CONFIG = {
  not_started: {
    label: 'Belum Mulai',
    color: 'bg-slate-100 text-slate-700',
    icon: Clock,
  },
  in_progress: {
    label: 'Sedang Berjalan',
    color: 'bg-primary-50 text-primary-700',
    icon: Activity,
  },
  completed: {
    label: 'Selesai',
    color: 'bg-success-50 text-success-700',
    icon: CheckCircle,
  },
  mismatch: {
    label: 'Ada Selisih',
    color: 'bg-yellow-50 text-yellow-700',
    icon: AlertTriangle,
  },
};

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
  const [opnameDate, setOpnameDate] = useState(() => dateTimeInput());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isView);
  const [existing, setExisting] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [scanMode, setScanMode] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [progress, setProgress] = useState({ started: 0, total: 0, completed: 0, inProgress: 0 });
  const [filters, setFilters] = useState({ status: 'all' });
  const [scanResult, setScanResult] = useState('');

  const products = useApi(
    () => productsApi.list({ search: debounced || undefined, pageSize: 50, sort: 'name' }).then((r) => r.data),
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
        setOpnameDate(dateTimeInput(res.data.opname_date));
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
        // Hitung progress
        const total = res.data.items.length;
        const started = res.data.items.filter((i) => i.status !== 'pending').length;
        const completed = res.data.items.filter((i) => i.status === 'completed').length;
        setProgress({ started, total, completed, inProgress: started - completed });
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isView]);

  // Update progress when items change
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
      
      // Otomatis tentukan status berdasarkan selisih
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
      // Simulate barcode scanner input
      // In real implementation, this would use a barcode scanner API or library
      const mockBarcode = prompt('Scan barcode (masukan kode barcode):');
      if (mockBarcode) {
        const { data } = await productsApi.list({ search: mockBarcode, pageSize: 1 });
        if (data.items && data.items.length > 0) {
          const product = data.items[0];
          addProduct(product);
          setScanResult(`Ditemukan: ${product.name}`);
          setTimeout(() => setScanResult(''), 3000);
        } else {
          toast.error('Produk tidak ditemukan dengan barcode tersebut');
          setScanResult('Produk tidak ditemukan');
          setTimeout(() => setScanResult(''), 3000);
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
    
    return {
      total,
      notStarted,
      completed,
      mismatch,
      less,
      more,
      totalValue,
    };
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
  const dateValid = Boolean(opnameDate) && !Number.isNaN(new Date(opnameDate).getTime());
  const canSave = dateValid && items.length > 0 && invalidItems.length === 0;

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (filters.status !== 'all') {
      filtered = filtered.filter((item) => item.status === filters.status);
    }
    // Apply search filter
    if (search) {
      filtered = filtered.filter(item => 
        item.product.name.toLowerCase().includes(search.toLowerCase()) ||
        item.product.sku.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [items, filters.status, search]);

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
    const Icon = config.icon;
    return (
      <Badge color={config.color} className="flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getDifferenceBadge = (diff) => {
    if (diff === 0) {
      return <Badge color="bg-success-50 text-success-700">Sesuai</Badge>;
    } else if (diff < 0) {
      return (
        <Badge color="bg-danger-50 text-danger-700" className="flex items-center gap-1">
          <TrendingDown className="h-3 w-3" /> Kurang {formatQty(Math.abs(diff))}
        </Badge>
      );
    } else {
      return (
        <Badge color="bg-emerald-50 text-emerald-700" className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Lebih {formatQty(diff)}
        </Badge>
      );
    }
  };

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="mt-6 h-40 w-full" />
        </Card>
      </div>
    );
  }

  const isReadOnly = isView && existing?.status !== 'draft';
  const stats = getStats();

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
            {isNew ? 'Pilih produk, isi stok fisik, dan catat selisih' : `${formatDateTime(existing?.opname_date)} · `}
            {existing && <StatusBadge status={existing.status} />}
          </p>
        </div>
        {isReadOnly && existing?.status === 'completed' && (
          <p className="text-xs text-slate-400">{stats.mismatch} produk disesuaikan</p>
        )}
      </div>

      {/* Ringkasan/Status */}
      {items.length > 0 && !isReadOnly && (
        <Card bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
            <StatCard 
              label="Total Produk" 
              value={stats.total} 
              icon={Package} 
              color="bg-primary-50 text-primary-600" 
              className="p-3" 
            />
            <StatCard 
              label="Belum Dihitung" 
              value={stats.notStarted} 
              icon={Clock} 
              color="bg-slate-100 text-slate-600" 
              className="p-3" 
            />
            <StatCard 
              label="Sesuai" 
              value={stats.completed} 
              icon={CheckCircle} 
              color="bg-success-50 text-success-600" 
              className="p-3" 
            />
            <StatCard 
              label="Selisih" 
              value={stats.mismatch} 
              icon={AlertTriangle} 
              color="bg-warning-50 text-warning-600" 
              className="p-3" 
            />
            <StatCard 
              label="Stok Kurang" 
              value={stats.less} 
              icon={TrendingDown} 
              color="bg-danger-50 text-danger-600" 
              className="p-3" 
            />
            <StatCard 
              label="Stok Lebih" 
              value={stats.more} 
              icon={TrendingUp} 
              color="bg-emerald-50 text-emerald-600" 
              className="p-3" 
            />
            <StatCard 
              label="Nilai Selisih" 
              value={formatRupiah(stats.totalValue)} 
              icon={FileText} 
              color="bg-info-50 text-info-600" 
              className="p-3" 
            />
          </div>
          {stats.total > 0 && (
            <div className="mt-4">
              <ProgressBar value={stats.completed} max={stats.total} showLabel className="h-2" />
              <p className="mt-1 text-xs text-slate-500">
                {stats.completed}/{stats.total} produk ({Math.round((stats.completed/stats.total) * 100)}% selesai)
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Filter dan Search */}
      {!isReadOnly && (
        <Card bodyClassName="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              <SearchInput 
                value={search} 
                onChange={setSearch} 
                placeholder="Cari produk..." 
                className="w-full" 
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <Select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-40"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
              <button onClick={handleScan} className="ml-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-primary-400 hover:bg-primary-50 transition-colors flex items-center gap-1">
                <Barcode className="h-4 w-4" />
                Scan Barcode
              </button>
            </div>
          </div>
          {scanResult && (
            <div className="mt-2 text-sm text-center">
              {scanResult.startsWith('Ditemukan') ? (
                <p className="text-success-600">{scanResult}</p>
              ) : (
                <p className="text-danger-600">{scanResult}</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Pilih produk */}
      {!isReadOnly && (
        <Card bodyClassName="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Tambah Produk</p>
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." className="w-64" />
          </div>
          <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.loading ? (
              <div className="col-span-full flex justify-center py-6">
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (products.data?.items || []).length === 0 ? (
              <p className="col-span-full text-sm text-slate-400">Produk tidak ditemukan</p>
            ) : (
              (products.data.items || []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  disabled={items.some((i) => i.product_id === p.id)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-primary-400 hover:bg-primary-50 disabled:opacity-40 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">Stok sistem: {formatQty(p.stock)}</p>
                  </div>
                  <Plus className="h-4 w-4 text-primary-500 ml-2" />
                </button>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Daftar item - Mobile optimized */}
      {items.length > 0 && (
        <Card title={`Item Opname (${items.length})`} bodyClassName="p-0">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
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
                          min="0"
                          step="any"
                          value={item.physical_stock}
                          disabled={isReadOnly}
                          onChange={(e) => updateItem(item.product_id, { physical_stock: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-24"
                          error={item.physical_stock === '' || Number(item.physical_stock) < 0}
                        />
                        {(item.physical_stock === '' || Number(item.physical_stock) < 0) && (
                          <p className="mt-1.5 text-xs text-danger-600" role="alert">{item.physical_stock === '' ? 'Wajib diisi' : 'Tidak boleh negatif'}</p>
                        )}
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
                          <button onClick={() => removeItem(item.product_id)} className="mb-1 rounded-md p-1.5 text-red-400 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden">
            <div className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const diff = Number(item.physical_stock) - Number(item.system_stock);
                return (
                  <div key={item.product_id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate">{item.product?.name}</p>
                        <p className="text-xs text-slate-400">{item.product?.sku}</p>
                      </div>
                      {!isReadOnly && (
                        <button onClick={() => removeItem(item.product_id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Stok Sistem:</span>
                        <span className="font-medium text-slate-700">{formatQty(item.system_stock)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Stok Fisik:</span>
                        {isReadOnly ? (
                          <span className="font-medium text-slate-700">{formatQty(item.physical_stock)}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.physical_stock}
                            onChange={(e) => updateItem(item.product_id, { physical_stock: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="h-8 w-20 text-center"
                            error={item.physical_stock === '' || Number(item.physical_stock) < 0}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Selisih:</span>
                        <div>
                          {diff > 0 ? (
                            <Badge color="bg-emerald-50 text-emerald-700" className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" /> Lebih {formatQty(diff)}
                            </Badge>
                          ) : diff < 0 ? (
                            <Badge color="bg-danger-50 text-danger-700" className="flex items-center gap-1">
                              <TrendingDown className="h-3 w-3" /> Kurang {formatQty(Math.abs(diff))}
                            </Badge>
                          ) : (
                            <Badge color="bg-success-50 text-success-700">Sesuai</Badge>
                          )}
                        </div>
                      </div>
                      {!isReadOnly && (
                        <div className="mt-2">
                          <Field label="Alasan" className="flex-1">
                            <Input
                              value={item.reason}
                              onChange={(e) => updateItem(item.product_id, { reason: e.target.value })}
                              placeholder="Alasan selisih"
                              className="w-full"
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Review Section */}
      {items.length > 0 && !isReadOnly && (
        <Card bodyClassName="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Review sebelum finalisasi</h3>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2 text-center">
              <p className="text-slate-500">Total</p>
              <p className="font-semibold text-slate-900">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-center">
              <p className="text-slate-500">Sudah Dihitung</p>
              <p className="font-semibold text-slate-900">{stats.completed}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-center">
              <p className="text-slate-500">Selisih</p>
              <p className="font-semibold text-slate-900">{stats.mismatch}</p>
            </div>
            <button
              onClick={() => setReviewOpen(true)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-left transition-colors hover:border-primary-400 hover:bg-primary-50"
            >
              <p className="text-slate-500">Lihat Detail</p>
              <p className="font-semibold text-primary-600">Klik untuk review →</p>
            </button>
          </div>
        </Card>
      )}

      {/* Tombol aksi */}
      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2">
          {!canSave && (
            <p className="mr-auto text-xs text-slate-400" role="alert">
              {items.length === 0
                ? 'Tambahkan minimal satu produk'
                : invalidItems.length > 0
                  ? `${invalidItems.length} produk memiliki stok fisik tidak valid`
                  : ''}
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

      {/* Review Modal */}
      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        items={items}
        stats={stats}
        opnameDate={opnameDate}
        notes={notes}
      />
    </div>
  );
}

function ReviewModal({ open, onClose, items, stats, opnameDate, notes }) {
  if (!open) return null;

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
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-primary-50 p-3 text-center">
              <p className="text-primary-600">Total Produk</p>
              <p className="text-lg font-bold text-primary-900">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-success-50 p-3 text-center">
              <p className="text-success-600">Sudah Dihitung</p>
              <p className="text-lg font-bold text-success-900">{stats.completed}</p>
            </div>
            <div className="rounded-lg bg-warning-50 p-3 text-center">
              <p className="text-warning-600">Selisih</p>
              <p className="text-lg font-bold text-warning-900">{stats.mismatch}</p>
            </div>
            <div className="rounded-lg bg-danger-50 p-3 text-center">
              <p className="text-danger-600">Stok Kurang</p>
              <p className="text-lg font-bold text-danger-900">{stats.less}</p>
            </div>
          </div>
          
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Daftar Produk dengan Selisih</h3>
            <div className="max-h-60 overflow-y-auto">
              {items.filter(i => i.status === 'mismatch').map((item) => {
                const diff = Number(item.physical_stock) - Number(item.system_stock);
                return (
                  <div key={item.product_id} className="mb-2 flex items-center justify-between rounded-lg bg-white p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{item.product?.name}</p>
                      <p className="text-xs text-slate-500">SKU: {item.product?.sku}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {item.system_stock} → {item.physical_stock}
                      </span>
                      <Badge color={diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-50 text-danger-700'}>
                        {diff > 0 ? '+' + diff : diff}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 p-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}