import { defineConfig } from '@playwright/test';

/**
 * E2E (Playwright) — alur minimal:
 *   Login → Buka POS → Tambah Produk → Checkout → Pembayaran → Transaksi Sukses → Stok berkurang
 *
 * Prasyarat:
 *   1. Backend & Supabase terhubung (isi backend/.env) + seed.sql terpasang
 *   2. npx playwright install chromium
 *   3. npx playwright test (dari folder frontend)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    locale: 'id-ID',
  },
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
