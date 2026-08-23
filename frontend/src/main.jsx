import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

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
