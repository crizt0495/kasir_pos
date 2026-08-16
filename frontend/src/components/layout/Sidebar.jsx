import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Package, Tags, Users, Truck, Boxes,
  ArrowLeftRight, ClipboardList, ShoppingBag, Wallet, PiggyBank, BarChart3, ShieldCheck,
  UserCog, KeyRound, ScrollText, Settings as SettingsIcon, X, Store, HandCoins,
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

export function Sidebar({ open, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions || []);

  const has = (perm) => (Array.isArray(perm) ? perm.some((p) => permissions.has(p)) : permissions.has(perm));

  // Close sidebar on mobile when navigating
  useEffect(() => {
    onClose?.();
  }, [location.pathname, onClose]);

  // Auto-collapse on smaller desktop screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sidebarWidth = collapsed ? 'w-16' : 'w-64';
  const showLabels = !collapsed;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-300 transition-all duration-200 ease-out lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarWidth}`}
        aria-label="Navigasi utama"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-600/30 ring-1 ring-primary-400/30">
              <Store className="h-5 w-5" aria-hidden="true" />
            </div>
            {showLabels && (
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">POS Kasir</p>
                <p className="text-[0.65rem] text-slate-400 truncate">Point of Sale</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label={collapsed ? 'Perluas sidebar' : 'Lipat sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors lg:hidden" aria-label="Tutup menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menu navigasi">
          {MENU.map((group, gi) => {
            const items = group.items.filter((i) => has(i.perm));
            if (!items.length) return null;
            return (
              <div key={gi} className="mb-3">
                {group.section && showLabels && (
                  <p className="mb-1.5 px-3 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-500">
                    {group.section}
                  </p>
                )}
                <ul className="space-y-0.5" role="list">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/dashboard'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                            isActive
                              ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-md shadow-primary-600/30'
                              : 'text-slate-300 hover:bg-slate-800/70 hover:text-white hover:translate-x-0.5'
                          }`
                        }
                        aria-current={item.to === location.pathname ? 'page' : undefined}
                        title={showLabels ? undefined : item.label}
                      >
                        <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {showLabels && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          {showLabels ? (
            <p className="text-xs text-slate-500 text-center">POS App v1.0</p>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800 mx-auto" title="POS App v1.0">
              <Store className="h-3.5 w-3.5 text-slate-400" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}