import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Auto-reload saat chunk JavaScript lama gagal dimuat (stale deploy:
// hash bundel berubah setelah redeploy, tab lama mereferensikan chunk
// yang sudah tidak ada — muat ulang sekali agar ambil index.html segar)
let staleReloaded = false;
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason;
  const isChunkError =
    err instanceof TypeError &&
    /Failed to fetch dynamically imported module/i.test(err?.message || '');
  if (isChunkError && !staleReloaded) {
    staleReloaded = true;
    window.location.reload();
  }
});

// PWA: daftarkan service worker (hanya di production / saat tersedia)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Saat SW baru aktif (bundle baru terdeploy), muat ulang sekali agar
        // pengguna tidak lagi menjalankan chunk lama yang sudah tidak cocok
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
        reg.update().catch(() => {});
      })
      .catch((err) => console.warn('Service worker gagal didaftarkan:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
