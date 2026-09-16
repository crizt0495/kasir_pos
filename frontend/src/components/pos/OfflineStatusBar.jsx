import { Clock } from 'lucide-react';

/**
 * Indikator status koneksi kasir + badge transaksi tertunda (mode offline).
 * Diposisikan absolut di kanan atas halaman POS.
 */
export default function OfflineStatusBar({ online, pendingCount = 0 }) {
  return (
    <div className="pointer-events-none absolute right-4 top-2 z-20 flex items-center gap-2">
      {pendingCount > 0 && (
        <span
          className="flex items-center gap-1.5 rounded-full border-2 border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm"
          aria-label={`${pendingCount} transaksi tertunda`}
          data-testid="pending-sales-badge"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {pendingCount} TRANSAKSI TERTUNDA
        </span>
      )}
      <span
        role="status"
        aria-label={online ? 'Online' : 'Offline'}
        className={`flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-semibold shadow-sm ${
          online ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'
        }`}
      >
        <span className={`relative flex h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" aria-hidden="true" />
          )}
        </span>
        {online ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>
  );
}