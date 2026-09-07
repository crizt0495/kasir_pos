import { CheckCircle2, Info, Inbox, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore.js';
import { Button } from './Button.jsx';

export function Badge({ color = 'bg-white text-slate-900', children, className = '', variant, dot = false }) {
  const variantStyles = {
    default: 'bg-white text-slate-900 border-2 border-black',
    primary: 'bg-primary-500 text-white border-2 border-black',
    success: 'bg-success-500 text-white border-2 border-black',
    warning: 'bg-warning-500 text-slate-900 border-2 border-black',
    danger: 'bg-danger-500 text-white border-2 border-black',
    info: 'bg-info-500 text-white border-2 border-black',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider ${variant ? variantStyles[variant] : color} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export const STATUS_BADGES = {
  active: 'bg-success-500 text-white',
  inactive: 'bg-slate-200 text-slate-900',
  completed: 'bg-success-500 text-white',
  draft: 'bg-warning-500 text-slate-900',
  received: 'bg-success-500 text-white',
  partial: 'bg-warning-500 text-slate-900',
  cancelled: 'bg-danger-500 text-white',
  paid: 'bg-success-500 text-white',
  unpaid: 'bg-danger-500 text-white',
  open: 'bg-success-500 text-white',
  closed: 'bg-slate-200 text-slate-900',
  refunded: 'bg-danger-500 text-white',
  partially_refunded: 'bg-warning-500 text-slate-900',
  pending: 'bg-warning-500 text-slate-900',
  processing: 'bg-primary-500 text-white',
  shipped: 'bg-info-500 text-white',
  delivered: 'bg-success-500 text-white',
};

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
  pending: 'Menunggu',
  processing: 'Diproses',
  shipped: 'Dikirim',
  delivered: 'Diterima',
};

export function StatusBadge({ status, className = '' }) {
  return (
    <Badge color={STATUS_BADGES[status] || 'bg-slate-200 text-slate-900'} className={className}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function Spinner({ className = 'h-5 w-5', color = 'text-primary-600' }) {
  return <Loader2 className={`animate-spin ${color} ${className}`} aria-hidden="true" />;
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton-shimmer rounded-md ${className}`} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 6, cols = 4 }) {
  return (
    <div className="space-y-3 p-4" aria-hidden="true">
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

export function EmptyState({ title = 'Belum ada data', description, action, icon: Icon = Inbox, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-12 text-center ${className}`}>
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-lg border-2 border-black bg-slate-100 text-slate-400 shadow-[3px_3px_0_0_#0A0A0A]">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">{title}</p>
      {description && <p className="max-w-xs text-xs text-slate-500 font-medium">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'Terjadi kesalahan, silakan coba lagi', onRetry, icon: Icon = XCircle, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 text-center ${className}`}>
      <Icon className="h-10 w-10 text-danger-400" aria-hidden="true" />
      <p className="text-sm font-bold text-slate-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, color = 'bg-primary-100 text-primary-600', sub, trend, trendUp = true, className = '', neo = false }) {
  if (neo) {
    return (
      <div className={`group rounded-xl border-2 border-black p-5 neo-shadow neopush ${className}`}>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-black/70 truncate">{label}</p>
        <p className="mt-1.5 text-xl sm:text-2xl font-extrabold text-black break-words tracking-tight font-mono">{value}</p>
        {sub && <p className="mt-1 text-[11px] font-bold text-black/60 break-words">{sub}</p>}
        {Icon && (
          <div className="mt-3 inline-flex items-center rounded-md border-2 border-black bg-white p-2 shadow-[3px_3px_0_0_#0A0A0A] transition-transform duration-200 group-hover:-rotate-6 group-hover:translate-x-[3px]">
            <Icon className="h-5 w-5 text-black" aria-hidden="true" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`group rounded-xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_0_#0A0A0A] card-hover ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 truncate">{label}</p>
          <p className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 break-words tracking-tight font-mono">{value}</p>
          {sub && <p className="mt-1 text-[11px] font-bold text-slate-500 break-words">{sub}</p>}
          {trend && (
            <p className={`mt-2 flex items-center gap-1 text-xs font-extrabold ${trendUp ? 'text-success-600' : 'text-danger-600'}`}>
              <span className="h-3.5 w-3.5" aria-hidden="true">
                {trendUp ? (
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06Z" /></svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M14.77 12.79a.75.75 0 01-1.06.02L10 8.832l-3.71 3.938a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06Z" /></svg>
                )}
              </span>
              {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`flex-shrink-0 rounded-lg border-2 border-black p-3 shadow-[2px_2px_0_0_#0A0A0A] transition-all duration-200 group-hover:-rotate-3 ${color}`}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, className = '', showLabel = false, color = 'primary' }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const colorClasses = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    info: 'bg-info-500',
  };

  return (
    <div className={`w-full ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={`Progress: ${percentage}%`}>
      <div className="h-2 rounded-md border-2 border-black overflow-hidden bg-white">
        <div
          className={`${colorClasses[color]} h-full rounded-sm transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && <p className="mt-1 text-xs font-extrabold text-slate-700 text-right">{Math.round(percentage)}%</p>}
    </div>
  );
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const remove = useUiStore((s) => s.removeToast);

  const icons = {
    success: (
      <svg className="h-4 w-4 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="h-4 w-4 text-danger-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    info: (
      <svg className="h-4 w-4 text-info-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="h-4 w-4 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  const iconBoxes = {
    success: 'bg-success-100',
    error: 'bg-danger-100',
    info: 'bg-info-100',
    warning: 'bg-warning-100',
  };

  const bars = {
    success: 'bg-success-500',
    error: 'bg-danger-500',
    info: 'bg-info-500',
    warning: 'bg-warning-500',
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border-2 border-black bg-white p-3 pl-4 shadow-[5px_5px_0_0_#0A0A0A] animate-slide-in"
          role="alert"
          aria-live="polite"
        >
          <span className={`absolute inset-y-0 left-0 w-1.5 ${bars[t.type]}`} aria-hidden="true" />
          <span className={`flex-shrink-0 rounded-md border-2 border-black p-1.5 ${iconBoxes[t.type]}`} aria-hidden="true">
            {icons[t.type]}
          </span>
          <p className="flex-1 pt-0.5 text-sm font-bold text-slate-800">{t.message}</p>
          <button
            className="flex-shrink-0 rounded-md border-2 border-black bg-white p-1 text-slate-400 hover:bg-slate-100 active:translate-x-[1px] active:translate-y-[1px] transition-all duration-100"
            onClick={() => remove(t.id)}
            aria-label="Tutup notifikasi"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function InlineAlert({ type = 'info', title, children, className = '', onDismiss }) {
  const typeStyles = {
    info: 'bg-primary-100 border-primary-300 text-primary-900',
    success: 'bg-success-100 border-success-300 text-success-900',
    warning: 'bg-warning-100 border-warning-300 text-warning-900',
    danger: 'bg-danger-100 border-danger-300 text-danger-900',
  };

  const typeIcons = {
    info: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    danger: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div className={`flex gap-3 rounded-lg border-2 p-4 ${typeStyles[type]} ${className}`} role="alert">
      {typeIcons[type]}
      <div className="flex-1 min-w-0">
        {title && <p className="font-extrabold uppercase tracking-wide text-[11px]">{title}</p>}
        <div className="mt-1 text-sm font-medium">{children}</div>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Tutup">
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}