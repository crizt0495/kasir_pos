import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useUiStore } from '../../stores/uiStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import GlobalSearch from '../GlobalSearch.jsx';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const setGlobalSearchOpen = useUiStore((s) => s.setGlobalSearchOpen);
  const clear = useAuthStore((s) => s.clear);

  // Tutup sidebar saat pindah halaman (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Keyboard shortcuts global
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

  // Jaga sesi tetap valid saat tab kembali aktif
  useEffect(() => {
    const onFocus = () => {
      if (useAuthStore.getState().user) {
        // revalidasi sesi secara diam-diam
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
    <div className="flex h-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <GlobalSearch />
    </div>
  );
}
