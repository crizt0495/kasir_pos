const PING_URL = '/api/health';
const PING_INTERVAL = 5000;
const PING_TIMEOUT = 3500;

let backendReachable =
  typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;
let monitorStarted = false;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

function setBackendReachable(value) {
  if (backendReachable !== value) {
    backendReachable = value;
    notify();
  }
}

/**
 * Offline secara fungsi = browser offline ATAU backend tak terjangkau.
 * navigator.onLine tidak bisa dipercaya penuh (Wi-Fi nyambung tapi internet
 * mati / captive portal tetap onLine=true), sehingga ping /api/health
 * (yang dibalas 503 oleh service worker saat offline) jadi penentu utama.
 */
export function isOffline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return !backendReachable;
}

export function isOnline() {
  return !isOffline();
}

/** Subscribe perubahan status backend-reachable. Returns unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Ping /api/health sekali. Hanya dianggap "reachable" jika respons berupa
 * JSON OK — HTML captive portal (200) tidak dihitung.
 */
export async function verifyBackendReachable() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PING_TIMEOUT);
    const res = await fetch(PING_URL, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(t);
    const contentType = res.headers.get('content-type') || '';
    const ok = res.ok && contentType.includes('application/json');
    setBackendReachable(ok);
    return ok;
  } catch {
    setBackendReachable(false);
    return false;
  }
}

/**
 * Mulai monitor koneksi global: ping tiap 5 detik + tangani event online/offline.
 * Idempotent — aman dipanggil dari main.jsx maupun useOnlineStatus.
 */
export function startConnectivityMonitor() {
  if (monitorStarted || typeof window === 'undefined') return;
  monitorStarted = true;

  const onOnline = () => {
    setBackendReachable(true);
    verifyBackendReachable();
  };
  const onOffline = () => setBackendReachable(false);

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  verifyBackendReachable();
  setInterval(() => verifyBackendReachable(), PING_INTERVAL);
}