import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Package, Tags, Users, Truck, Boxes,
  ArrowLeftRight, ClipboardList, ShoppingBag, Wallet, PiggyBank, BarChart3, ShieldCheck,
  UserCog, KeyRound, ScrollText, Settings as SettingsIcon, X, Store, HandCoins,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';

const MENU = [
  { section: null, items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }] },
  {
    section: 'Transaksi',
    items: [
      { label: 'POS', to: '/pos', icon: ShoppingCart, perm: 'pos.access' },
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
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions || []);

  const has = (perm) => (Array.isArray(perm) ? perm.some((p) => permissions.has(p)) : permissions.has(perm));

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">POS Kasir</p>
              <p className="text-xs text-slate-400">Point of Sale</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-800 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MENU.map((group, gi) => {
            const items = group.items.filter((i) => has(i.perm));
            if (!items.length) return null;
            return (
              <div key={gi} className="mb-4">
                {group.section && (
                  <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {group.section}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/dashboard'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-4 py-3">
          <p className="text-xs text-slate-500">POS App v1.0</p>
        </div>
      </aside>
    </>
  );
}
