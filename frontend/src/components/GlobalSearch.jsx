import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, ReceiptText, Users, Truck, Inbox } from 'lucide-react';
import { useUiStore } from '../stores/uiStore.js';
import { searchApi } from '../api/index.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { formatRupiah, formatDateTime, paymentMethodLabel } from '../utils/format.js';

const GROUPS = [
  { key: 'products', label: 'Produk', icon: Package, path: (r) => `/products/${r.id}/edit` },
  { key: 'sales', label: 'Penjualan', icon: ReceiptText, path: (r) => `/sales/${r.id}` },
  { key: 'customers', label: 'Pelanggan', icon: Users, path: (r) => `/customers/${r.id}` },
  { key: 'suppliers', label: 'Supplier', icon: Truck, path: (r) => `/suppliers/${r.id}` },
];

export default function GlobalSearch() {
  const open = useUiStore((s) => s.globalSearchOpen);
  const setOpen = useUiStore((s) => s.setGlobalSearchOpen);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebounce(query, 300);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setResults(null);
    setTimeout(() => inputRef.current?.focus(), 50);
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !debounced.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    searchApi
      .all(debounced.trim())
      .then((res) => {
        if (!cancelled) setResults(res.data);
      })
      .catch(() => {
        if (!cancelled) setResults({ products: [], sales: [], customers: [], suppliers: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  // Flatten untuk navigasi keyboard
  const flat = [];
  (results ? GROUPS.filter((g) => results[g.key]?.length) : []).forEach((g) => {
    results[g.key].forEach((r) => flat.push({ group: g, row: r }));
  });

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    navigate(item.group.path(item.row));
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[activeIndex]);
    }
  };

  if (!open) return null;

  const total = results ? GROUPS.reduce((sum, g) => sum + (results[g.key]?.length || 0), 0) : 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/50 p-4 pt-24 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Cari produk, transaksi, pelanggan, supplier..."
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {!query.trim() && <p className="px-4 py-6 text-center text-sm text-slate-400">Ketik untuk mencari...</p>}

          {query.trim() && results && total === 0 && (
            <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-400">
              <Inbox className="h-4 w-4" /> Tidak ditemukan hasil untuk “{query}”
            </p>
          )}

          {results &&
            GROUPS.filter((g) => results[g.key]?.length).map((g) => (
              <div key={g.key} className="mb-1">
                <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                {results[g.key].map((row) => {
                  const idx = flat.findIndex((f) => f.group.key === g.key && f.row.id === row.id);
                  return (
                    <button
                      key={row.id}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(flat[idx])}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                        idx === activeIndex ? 'bg-primary-50' : ''
                      }`}
                    >
                      <g.icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        {g.key === 'products' && (
                          <>
                            <p className="truncate font-medium text-slate-800">{row.name}</p>
                            <p className="text-xs text-slate-400">
                              {row.sku} · Stok {row.stock} · {formatRupiah(row.sale_price)}
                            </p>
                          </>
                        )}
                        {g.key === 'sales' && (
                          <>
                            <p className="font-medium text-slate-800">{row.invoice_number}</p>
                            <p className="text-xs text-slate-400">
                              {formatRupiah(row.total)} · {formatDateTime(row.created_at)}
                            </p>
                          </>
                        )}
                        {(g.key === 'customers' || g.key === 'suppliers') && (
                          <>
                            <p className="font-medium text-slate-800">{row.name}</p>
                            <p className="text-xs text-slate-400">{row.phone || '-'}</p>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
