import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { countPendingSales } from '../../offline/pendingSales.js';

/**
 * Indikator status koneksi + jumlah transaksi offline tertunda.
 * Dipasang di header kiri (Sidebar) — TIDAK lagi mengapung fixed di kanan atas
 * agar tidak menutupi tombol Keranjang / menu di halaman POS.
 */
export default function ConnectionStatus({ compact = false }) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(pending);

  const refresh = () => {
    countPendingSales()
      .then((n) => {
        pendingRef.current = Number(n) || 0;
        setPending(pendingRef.current);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    window.addEventListener('pos:pending-changed', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('pos:pending-changed', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  if (compact) {
    return (
      <span
        role="status"
        aria-label={online ? 'Online' : pending > 0 ? `Offline, ${pending} transaksi tertunda` : 'Offline'}
        title={pending > 0 ? `${pending} transaksi tertunda` : undefined}
        className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
      >
        {!online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" aria-hidden="true" />
        )}
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={online ? 'Online' : pending > 0 ? `Offline, ${pending} transaksi tertunda` : 'Offline'}
      title={pending > 0 ? `${pending} transaksi tertunda` : undefined}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold leading-none ${
        online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700 animate-pulse'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
      {online ? 'ONLINE' : pending > 0 ? `OFFLINE - ${pending} Tertunda` : 'OFFLINE'}
    </span>
  );
}