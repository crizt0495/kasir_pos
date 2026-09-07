import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Package, Tags, Users, Truck, Boxes,
  ArrowLeftRight, ClipboardList, ShoppingBag, Wallet, PiggyBank, BarChart3, ShieldCheck,
  UserCog, KeyRound, ScrollText, Settings as SettingsIcon, X, Store, HandCoins, BookUser,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';

const MENU = [
  { section: null, items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }] },
  {
    section: 'Transaksi',
    items: [
      { label: 'POS / Kasir', to: '/pos', icon: ShoppingCart, perm: 'pos.access' },
      { label: 'Penjualan', to: '/sales', icon: ReceiptText, perm: 'sales.view' },
      { label: 'Hutang', to: '/debts', icon: BookUser, perm: 'customers.view' },
      { label: 'Retur', to: '/returns', icon: ArrowLeftRight, perm: 'returns.view' },
    ],
  },
  {
    section: 'Master Data',
    items: [
      { label: 'Produk', to: '/products', icon: Package, perm: 'products.view' },
      { label: 'Kategori', to: '/categories', icon: Tags, perm: 'categories.view' },
      { label: 'Pelanggan', to: '/customers', icon: Users, perm: 'customers.view' },
      { label: 'Supplier', to: '/suppliers', icon: Truck, perm: 'suppliers.view' },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { label: 'Stok', to: '/inventory', icon: Boxes, perm: 'inventory.view' },
      { label: 'Pergerakan Stok', to: '/inventory/movements', icon: ArrowLeftRight, perm: 'inventory.view' },
      { label: 'Stock Opname', to: '/inventory/opname', icon: ClipboardList, perm: 'stock_opname.view' },
    ],
  },
  {
    section: null,
    items: [{ label: 'Pembelian', to: '/purchases', icon: ShoppingBag, perm: 'purchases.view' }],
  },
  {
    section: 'Kas',
    items: [
      { label: 'Kasir', to: '/cashier', icon: Wallet, perm: ['cashier.view', 'cashier.open'] },
      { label: 'Pengeluaran', to: '/expenses', icon: PiggyBank, perm: 'expenses.view' },
    ],
  },
  {
    section: null,
    items: [
      { label: 'Laporan', to: '/reports', icon: BarChart3, perm: 'reports.view' },
      { label: 'Bagi Hasil 2,5%', to: '/profit-sharing', icon: HandCoins, perm: 'profit.view' },
    ],
  },
  {
    section: 'Administrasi',
    items: [
      { label: 'Users', to: '/users', icon: UserCog, perm: 'users.view' },
      { label: 'Roles', to: '/roles', icon: ShieldCheck, perm: 'roles.view' },
      { label: 'Permissions', to: '/permissions', icon: KeyRound, perm: 'permissions.view' },
      { label: 'Audit Log', to: '/audit-logs', icon: ScrollText, perm: 'audit.view' },
    ],
  },
  {
    section: null,
    items: [{ label: 'Settings', to: '/settings', icon: SettingsIcon, perm: 'settings.view' }],
  },
];

const COLLAPSE_KEY = 'pos.sidebar.collapsed';

export function Sidebar({ open, onClose }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions || []);

  const has = (perm) => (Array.isArray(perm) ? perm.some((p) => permissions.has(p)) : permissions.has(perm));

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setCollapsed(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (open) setCollapsed(false);
  }, [open]);

  const sidebarWidth = collapsed ? 'w-16' : 'w-64';
  const showLabels = !collapsed;

  const itemDepth = (to) => {
    const p = location.pathname;
    if (p === to) return Infinity;
    return p.startsWith(to + '/') ? to.split('/').length : -1;
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r-2 border-black bg-white text-slate-600 transition-all duration-200 ease-out lg:relative lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarWidth}`}
        aria-label="Navigasi utama"
      >
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-16 z-10 hidden h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-primary-400 text-white shadow-[2px_2px_0_0_#0A0A0A] transition-colors hover:bg-primary-500 lg:flex"
            aria-label="Perluas sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <div className={`flex shrink-0 items-center border-b-2 border-black py-4 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <div className={`flex min-w-0 items-center gap-3 ${collapsed ? 'justify-center' : 'flex-1'}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-primary-500 text-white shadow-[3px_3px_0_0_#0A0A0A]">
              <Store className="h-5 w-5" aria-hidden="true" />
            </div>
            {showLabels && (
              <div className="overflow-hidden">
                <p className="truncate text-sm font-extrabold text-slate-900 tracking-tight font-display uppercase">POS Kasir</p>
                <p className="truncate text-[0.65rem] font-bold text-slate-400">Point of Sale</p>
              </div>
            )}
          </div>
          {showLabels && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCollapsed(true)}
                className="hidden rounded-md border-2 border-transparent p-1.5 text-slate-400 transition-colors hover:border-black hover:bg-slate-100 hover:text-slate-900 lg:inline-flex"
                aria-label="Lipat sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="rounded-md border-2 border-transparent p-1.5 text-slate-400 transition-colors hover:border-black hover:bg-slate-100 hover:text-slate-900 lg:hidden"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3" aria-label="Menu navigasi">
          {MENU.map((group, gi) => {
            const items = group.items.filter((i) => has(i.perm));
            if (!items.length) return null;
            const best = items.reduce((max, it) => Math.max(max, itemDepth(it.to)), -1);
            return (
              <div key={gi} className="mb-3">
                {group.section && showLabels && (
                  <p className="mb-1.5 px-3 text-[0.6rem] font-extrabold uppercase tracking-widest text-slate-400">
                    {group.section}
                  </p>
                )}
                <ul className="space-y-1" role="list">
                  {items.map((item) => {
                    const active = best > -1 && itemDepth(item.to) === best;
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          onClick={onClose}
                          className={`relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-bold transition-all duration-100 ${
                            collapsed ? 'justify-center px-0' : 'px-3'
                          } ${
                            active
                              ? 'bg-primary-500 text-white border-2 border-black shadow-[3px_3px_0_0_#372C14]'
                              : 'border-2 border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          aria-current={active ? 'page' : undefined}
                          title={showLabels ? undefined : item.label}
                        >
                          {active && !collapsed && (
                            <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 bg-black" aria-hidden="true" />
                          )}
                          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          {showLabels && <span className="truncate">{item.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t-2 border-black p-4">
          {showLabels ? (
            <p className="text-center text-[0.65rem] font-bold text-slate-400">POS App v1.0</p>
          ) : (
            <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-md border border-black bg-slate-100" title="POS App v1.0">
              <Store className="h-3.5 w-3.5 text-slate-500" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}