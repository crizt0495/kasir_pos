import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, ReceiptText, Settings as SettingsIcon,
  MoreHorizontal, X, Tags, Users, Truck, Boxes, ArrowLeftRight, ClipboardList,
  ShoppingBag, Wallet, PiggyBank, BarChart3, ShieldCheck, UserCog, KeyRound,
  ScrollText, HandCoins,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';

const MAIN_ITEMS = [
  { label: 'Beranda', to: '/dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
  { label: 'POS', to: '/pos', icon: ShoppingCart, perm: 'pos.access' },
  { label: 'Produk', to: '/products', icon: Package, perm: 'products.view' },
  { label: 'Penjualan', to: '/sales', icon: ReceiptText, perm: 'sales.view' },
];

const MORE_ITEMS = [
  { section: 'Transaksi', items: [
    { label: 'Retur', to: '/returns', icon: ArrowLeftRight, perm: 'returns.view' },
    { label: 'Pembelian', to: '/purchases', icon: ShoppingBag, perm: 'purchases.view' },
  ]},
  { section: 'Master Data', items: [
    { label: 'Kategori', to: '/categories', icon: Tags, perm: 'categories.view' },
    { label: 'Pelanggan', to: '/customers', icon: Users, perm: 'customers.view' },
    { label: 'Supplier', to: '/suppliers', icon: Truck, perm: 'suppliers.view' },
  ]},
  { section: 'Inventory', items: [
    { label: 'Stok', to: '/inventory', icon: Boxes, perm: 'inventory.view' },
    { label: 'Pergerakan Stok', to: '/inventory/movements', icon: ArrowLeftRight, perm: 'inventory.view' },
    { label: 'Stock Opname', to: '/inventory/opname', icon: ClipboardList, perm: 'stock_opname.view' },
  ]},
  { section: 'Kas', items: [
    { label: 'Kasir', to: '/cashier', icon: Wallet, perm: ['cashier.view', 'cashier.open'] },
    { label: 'Pengeluaran', to: '/expenses', icon: PiggyBank, perm: 'expenses.view' },
  ]},
  { section: 'Lainnya', items: [
    { label: 'Laporan', to: '/reports', icon: BarChart3, perm: 'reports.view' },
    { label: 'Bagi Hasil 2,5%', to: '/profit-sharing', icon: HandCoins, perm: 'profit.view' },
    { label: 'Users', to: '/users', icon: UserCog, perm: 'users.view' },
    { label: 'Roles', to: '/roles', icon: ShieldCheck, perm: 'roles.view' },
    { label: 'Permissions', to: '/permissions', icon: KeyRound, perm: 'permissions.view' },
    { label: 'Audit Log', to: '/audit-logs', icon: ScrollText, perm: 'audit.view' },
    { label: 'Settings', to: '/settings', icon: SettingsIcon, perm: 'settings.view' },
  ]},
];

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions || []);

  const has = (perm) => (Array.isArray(perm) ? perm.some((p) => permissions.has(p)) : permissions.has(perm));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const filteredMain = MAIN_ITEMS.filter((item) => has(item.perm));
  const isMoreActive = MORE_ITEMS.some((group) =>
    group.items.some((item) => has(item.perm) && (
      location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    ))
  );

  const itemDepth = (to) => {
    const p = location.pathname;
    if (p === to) return Infinity;
    return p.startsWith(to + '/') ? to.split('/').length : -1;
  };

  return (
    <>
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md safe-area-bottom">
        <nav className="flex items-center justify-around px-1 py-1" aria-label="Navigasi utama mobile">
          {filteredMain.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-colors ${
                  active ? 'text-primary-600' : 'text-slate-400'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <div className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                  active ? 'bg-primary-100' : ''
                }`}>
                  <item.icon className={`h-5 w-5 ${active ? 'text-primary-600' : ''}`} aria-hidden="true" />
                  {active && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary-500" aria-hidden="true" />
                  )}
                </div>
                <span className={`text-[0.65rem] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-colors ${
              isMoreActive ? 'text-primary-600' : 'text-slate-400'
            }`}
            aria-label="Menu lainnya"
            aria-expanded={moreOpen}
          >
            <div className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
              isMoreActive ? 'bg-primary-100' : ''
            }`}>
              <MoreHorizontal className={`h-5 w-5 ${isMoreActive ? 'text-primary-600' : ''}`} aria-hidden="true" />
              {isMoreActive && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary-500" aria-hidden="true" />
              )}
            </div>
            <span className={`text-[0.65rem] leading-tight ${isMoreActive ? 'font-semibold' : 'font-medium'}`}>
              Lainnya
            </span>
          </button>
        </nav>
      </div>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-10 max-h-[80vh] rounded-t-2xl bg-white shadow-2xl flex flex-col animate-slide-up" role="dialog" aria-label="Menu tambahan">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Menu Lainnya</h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-4" aria-label="Menu tambahan">
              {MORE_ITEMS.map((group, gi) => {
                const items = group.items.filter((i) => has(i.perm));
                if (!items.length) return null;
                return (
                  <div key={gi}>
                    <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">
                      {group.section}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const active = itemDepth(item.to) > -1;
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                              active
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                            aria-current={active ? 'page' : undefined}
                          >
                            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            <span className="flex-1">{item.label}</span>
                            <span className="text-slate-300">&rsaquo;</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
