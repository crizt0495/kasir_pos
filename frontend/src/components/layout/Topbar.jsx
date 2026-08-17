import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Search, ChevronRight, LogOut, KeyRound, UserCircle2, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { authApi } from '../../api/index.js';
import { toast } from '../../stores/uiStore.js';
import { initials } from '../../utils/format.js';
import { resolvePageTitle } from '../../utils/routeMeta.js';
import { NotificationsBell } from './NotificationsBell.jsx';
import { Button } from '../ui/Button.jsx';

export function Topbar({ onMenuClick }) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const setGlobalSearchOpen = useUiStore((s) => s.setGlobalSearchOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const path = location.pathname;
  const title = resolvePageTitle(path);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    clear();
    navigate('/login');
    toast.info('Anda telah logout');
  };

  const displayName = user?.profile?.full_name || user?.username || '';
  const roleName = user?.roles?.[0]?.name || '-';

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
      if (e.key === 'F1') {
        e.preventDefault();
        window.location.href = '/pos';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setGlobalSearchOpen]);

  // Session validation on focus
  useEffect(() => {
    const onFocus = () => {
      if (useAuthStore.getState().user) {
        import('../../api/index.js').then(({ authApi }) =>
          authApi.me().catch(() => {
            clear();
          })
        );
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [clear]);

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
            <Link to="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
              Beranda
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium text-slate-800 truncate max-w-[200px]">{title}</span>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <button
              onClick={() => setGlobalSearchOpen(true)}
              className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-sm text-slate-500 hover:border-primary-300 hover:text-slate-700 hover:bg-white hover:shadow-sm transition-all duration-150"
              aria-label="Pencarian global (Ctrl+K)"
            >
              <span className="flex items-center gap-1.5">
                <Search className="h-4 w-4 text-slate-400 group-hover:text-primary-500 transition-colors" aria-hidden="true" />
                <span>Cari produk, pelanggan, transaksi...</span>
                <kbd className="kbd ml-1">Ctrl K</kbd>
              </span>
            </button>
          </div>

          <NotificationsBell />

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Menu pengguna"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-xs font-bold text-white ring-2 ring-primary-200/60 shadow-md shadow-primary-500/20">
                {initials(displayName)}
              </div>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium leading-tight text-slate-800 truncate max-w-[140px]">{displayName}</p>
                <p className="text-xs leading-tight text-slate-400 truncate max-w-[140px]">{roleName}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200/80 bg-white py-1.5 shadow-xl shadow-slate-900/10 animate-scale-in">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
                    <p className="text-xs text-slate-400 truncate">@{user?.username} · {roleName}</p>
                  </div>
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/change-password');
                    }}
                  >
                    <KeyRound className="h-4 w-4" /> Ganti Password
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}