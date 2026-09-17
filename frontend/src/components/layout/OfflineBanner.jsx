import { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [showOnline, setShowOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowOnline(false);
      return undefined;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowOnline(true);
      const timer = setTimeout(() => setShowOnline(false), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [online]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 border-b-2 border-black bg-danger-600 px-4 py-2.5 text-center text-sm font-bold text-white"
      >
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Anda sedang OFFLINE — transaksi tetap tersimpan &amp; disinkronkan saat internet kembali.</span>
      </div>
    );
  }

  if (showOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 border-b-2 border-black bg-success-600 px-4 py-2.5 text-center text-sm font-bold text-white"
      >
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Kembali ONLINE — menyinkronkan data...</span>
      </div>
    );
  }

  return null;
}
