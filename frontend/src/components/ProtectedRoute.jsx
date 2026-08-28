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

/** Wajib punya permission tertentu; redirect ke fallback bila tidak punya. */
export function RequirePermission({ permission, children, fallback = '/login' }) {
  const can = useAuthStore((s) => s.can);
  const location = useLocation();
  if (!can(permission)) {
    return <Navigate to={fallback} state={{ from: location.pathname }} replace />;
  }
  return children;
}
