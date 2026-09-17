import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SW_PRECACHE_TOKEN =
  "typeof __SW_PRECACHE_JSON__ !== 'undefined' ? __SW_PRECACHE_JSON__ : []";

/**
 * Injeksi daftar aset ber-hash ke dalam sw.js saat build (closeBundle).
 * Tanpa daftar ini, cache lama berisi index.html yang mereferensikan chunk
 * baru yang belum pernah di-cache → offline gagal memuat JS sama sekali.
 */
function injectSwPrecache() {
  return {
    name: 'pos-inject-sw-precache',
    apply: 'build',
    closeBundle() {
      const distDir = resolve(process.cwd(), 'dist');
      const swPath = join(distDir, 'sw.js');
      let files = [];
      try {
        files = readdirSync(join(distDir, 'assets')).map((f) => `/assets/${f}`);
      } catch {
        /* belum ada folder assets */
      }
      const json = JSON.stringify(files);
      try {
        const src = readFileSync(swPath, 'utf8');
        if (!src.includes(SW_PRECACHE_TOKEN)) {
          console.warn('[pos-inject-sw-precache] token tidak ditemukan di sw.js — lewati');
          return;
        }
        writeFileSync(swPath, src.replace(SW_PRECACHE_TOKEN, json), 'utf8');
        console.log(`[pos-inject-sw-precache] ${files.length} aset di-precache`);
      } catch (err) {
        console.warn('[pos-inject-sw-precache] gagal:', err.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectSwPrecache()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
