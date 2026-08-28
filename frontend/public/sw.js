/* POS Kasir — Service Worker (PWA)
   - Cache app shell untuk offline & akses cepat
   - API tidak di-cache (selalu jaringan)
   - Push notification + click → buka aplikasi */
const CACHE = 'pos-shell-v4';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Hanya tangani request http(s) — abaikan chrome-extension://, data:, dll */
const isSupported = (url) => url.protocol === 'http:' || url.protocol === 'https:';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return; // URL tidak valid — biarkan browser menangani
  }
  // Abaikan skema non-http (chrome-extension, data, blob, dll)
  if (!isSupported(url)) return;

  // API selalu lewat jaringan (jangan cache data transaksi)
  if (url.pathname.startsWith('/api')) return;

  // Navigasi: network-first, fallback ke shell (SPA — semua route → index.html)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaqueredirect') return res;
          return caches.match('/index.html').then((cached) => cached || Response.error());
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Aset statis: cache-first (hanya http/https — sudah difilter di atas)
  // API & rute dinamis (mis. /expenses ketika fetch ke API backend) selalu
  // ke network; jika gagal, kirim error response agar tidak reject promise.
  if (url.pathname.startsWith('/expenses')) {
    event.respondWith(
      fetch(req).catch(() => new Response('Network unavailable', { status: 503 }))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(req, copy))
              .catch(() => {}); // cache gagal tidak boleh mengganggu respons
          }
          return res;
        }).catch(() => caches.match('/index.html').then((cached) => cached || new Response('Offline', { status: 503 })))
    )
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* abaikan payload tidak valid */
  }
  const title = payload.title || 'Notifikasi';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'pos-notif',
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('navigate' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
