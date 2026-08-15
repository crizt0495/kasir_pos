import { CheckCircle2, Info, Inbox, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore.js';
import { Button } from './Button.jsx';

export function Badge({ color = 'bg-slate-100 text-slate-700', children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {children}
    </span>
  );
}

export const STATUS_BADGES = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  completed: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  unpaid: 'bg-red-100 text-red-700',
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
  refunded: 'bg-red-100 text-red-700',
  partially_refunded: 'bg-amber-100 text-amber-700',
};

export function StatusBadge({ status }) {
  return (
    <Badge color={STATUS_BADGES[status] || 'bg-slate-100 text-slate-700'}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export const STATUS_LABELS = {
  active: 'Aktif',
  inactive: 'Nonaktif',
  completed: 'Selesai',
  draft: 'Draft',
  received: 'Diterima',
  partial: 'Sebagian',
  cancelled: 'Dibatalkan',
  paid: 'Lunas',
  unpaid: 'Belum Bayar',
  open: 'Terbuka',
  closed: 'Ditutup',
  refunded: 'Diretur',
  partially_refunded: 'Retur Sebagian',
};

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-indigo-600 ${className}`} />;
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function SkeletonRows({ rows = 6, cols = 4 }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Belum ada data', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox className="h-10 w-10 text-slate-300" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="text-xs text-slate-400">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'Terjadi kesalahan, silakan coba lagi', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <XCircle className="h-10 w-10 text-red-400" />
      <p className="text-sm text-slate-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, color = 'bg-indigo-50 text-indigo-600', sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const remove = useUiStore((s) => s.removeToast);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    error: <AlertTriangle className="h-4 w-4 text-red-500" />,
    info: <Info className="h-4 w-4 text-sky-500" />,
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          {icons[t.type]}
          <p className="flex-1 text-sm text-slate-700">{t.message}</p>
          <button className="text-slate-400 hover:text-slate-600" onClick={() => remove(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
