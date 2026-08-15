import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Menu, Search, ChevronRight, LogOut, KeyRound, UserCircle2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { authApi } from '../../api/index.js';
import { toast } from '../../stores/uiStore.js';
import { initials } from '../../utils/format.js';
import { NotificationsBell } from './NotificationsBell.jsx';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/pos': 'POS / Kasir',
  '/products': 'Produk',
  '/categories': 'Kategori',
  '/customers': 'Pelanggan',
  '/suppliers': 'Supplier',
  '/inventory': 'Stok',
  '/inventory/movements': 'Pergerakan Stok',
  '/inventory/opname': 'Stock Opname',
  '/purchases': 'Pembelian',
  '/sales': 'Penjualan',
  '/returns': 'Retur',
  '/cashier': 'Kasir',
  '/expenses': 'Pengeluaran',
  '/reports': 'Laporan',
  '/profit-sharing': 'Bagi Hasil 2,5%',
  '/users': 'Users',
  '/roles': 'Roles',
  '/permissions': 'Permissions',
  '/audit-logs': 'Audit Log',
  '/settings': 'Settings',
  '/change-password': 'Ganti Password',
};

export function Topbar({ onMenuClick }) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const setGlobalSearchOpen = useUiStore((s) => s.setGlobalSearchOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const path = location.pathname;
  const base = `/${path.split('/')[1]}`;
  const title = TITLES[base] || TITLES[path] || 'POS';

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* abaikan */
    }
    clear();
    navigate('/login');
    toast.info('Anda telah logout');
  };

  const displayName = user?.profile?.full_name || user?.username || '';
  const roleName = user?.roles?.[0]?.name || '-';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1 text-sm">
          <Link to="/dashboard" className="text-slate-400 hover:text-slate-600">
            Beranda
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          <span className="font-medium text-slate-800">{title}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setGlobalSearchOpen(true)}
          className="hidden items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 hover:border-indigo-400 hover:text-slate-700 sm:flex"
        >
          <Search className="h-4 w-4" />
          <span>Cari...</span>
          <kbd className="rounded border border-slate-300 bg-white px-1.5 text-[10px] text-slate-400">Ctrl K</kbd>
        </button>

        <NotificationsBell />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              {initials(displayName)}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium leading-tight text-slate-800">{displayName}</p>
              <p className="text-xs leading-tight text-slate-400">{roleName}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-4 py-2">
                  <p className="text-sm font-medium text-slate-800">{displayName}</p>
                  <p className="text-xs text-slate-400">@{user?.username} · {roleName}</p>
                </div>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/change-password');
                  }}
                >
                  <KeyRound className="h-4 w-4" /> Ganti Password
                </button>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
