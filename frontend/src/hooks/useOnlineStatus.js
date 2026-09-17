import { useEffect, useState } from 'react';
import { isOffline, startConnectivityMonitor, subscribe } from '../utils/connectivity.js';

/**
 * Status koneksi realtime untuk mode offline kasir.
 * Memakai monitor global (ping /api/health tiap 5 detik + navigator events)
 * supaya sinyal konsisten dengan proteksi logout di interceptor/authStore.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(!isOffline());

  useEffect(() => {
    startConnectivityMonitor();
    const update = () => setOnline(!isOffline());
    update();
    const unsubscribe = subscribe(update);
    return unsubscribe;
  }, []);

  return online;
}