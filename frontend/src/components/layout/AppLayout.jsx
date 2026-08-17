import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { MobileNav } from './MobileNav.jsx';
import { Topbar } from './Topbar.jsx';
import { useUiStore } from '../../stores/uiStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { resolvePageTitle } from '../../utils/routeMeta.js';
import GlobalSearch from '../GlobalSearch.jsx';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const setGlobalSearchOpen = useUiStore((s) => s.setGlobalSearchOpen);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const title = resolvePageTitle(location.pathname);
    document.title = title === 'POS' ? 'POS — Kasir Modern' : `${title} — POS`;
  }, [location.pathname]);

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

  const isPOS = location.pathname === '/pos';

  return (
    <div className="flex h-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-primary-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Lewati ke konten utama
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className={`surface-grid app-backdrop flex-1 overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6 ${isPOS ? 'p-0 pb-0 lg:p-0 lg:pb-0' : ''}`}>
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />
      <GlobalSearch />
    </div>
  );
}
