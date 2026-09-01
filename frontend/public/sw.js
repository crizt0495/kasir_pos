/* POS Kasir — Service Worker (PWA)
   - Cache app shell untuk offline & akses cepat
   - API tidak di-cache (selalu jaringan)
   - Push notification + click → buka aplikasi
   - Versi: v8 — bump untuk paksa invalidate cache chunk lama */
const CACHE = 'pos-shell-v8';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
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
    return;
  }

  // Abaikan skema non-http
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // API selalu lewat jaringan (jangan cache data transaksi)
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ success: false, message: 'Network unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Navigasi SPA: network-first, fallback ke shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaqueredirect') return res;
          return caches.match('/index.html').then((cached) => cached || new Response('Not found', { status: 404 }));
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Aset statis: cache-first dengan fallback ke network
  // Jika chunk lama 404 → hapus dari cache agar hash baru ter-load
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => {
          return caches.match('/index.html').then((cached) => cached || new Response('Offline', { status: 503 }));
        })
    ).then((res) => {
      if (res && res.status === 404 && res.headers.get('content-type')?.includes('javascript')) {
        caches.open(CACHE).then((cache) => cache.delete(req));
      }
      return res;
    })
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
