import { useEffect, useRef, useState } from 'react';

/**
 * Status koneksi realtime untuk mode offline kasir.
 * Dihitung dari navigator.onLine + ping /api/health tiap 5 detik
 * (SW mengembalikan 503 saat offline → ping tidak ok).
 */
const PING_URL = '/api/health';
const PING_INTERVAL = 5000;
const PING_TIMEOUT = 3500;

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    let alive = true;
    let timer = null;
    let pending = false;

    const ping = async () => {
      if (pending) return;
      pending = true;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), PING_TIMEOUT);
        const res = await fetch(PING_URL, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(t);
        if (alive) setOnline(res.ok);
      } catch {
        if (alive) setOnline(false);
      } finally {
        pending = false;
      }
    };

    const onOnline = () => {
      setOnline(true);
      ping();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    ping();
    timer = setInterval(ping, PING_INTERVAL);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}