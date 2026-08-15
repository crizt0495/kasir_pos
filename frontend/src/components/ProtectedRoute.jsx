import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { Spinner } from './ui/index.jsx';

/** Wajib login; redirect ke /login bila belum. */
export function RequireAuth({ children }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Wajib ganti password (akun seed / reset admin)
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}

/** Wajib punya permission tertentu; selain itu tampilkan 403. */
export function RequirePermission({ permission, children }) {
  const can = useAuthStore((s) => s.can);
  if (!can(permission)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-5xl font-bold text-slate-300">403</p>
        <p className="text-sm text-slate-500">Anda tidak memiliki akses ke halaman ini.</p>
      </div>
    );
  }
  return children;
}
