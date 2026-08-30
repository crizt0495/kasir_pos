import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '/home/chris/Documents/Aplikasi/pos/frontend/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    locale: 'id-ID',
    viewport: { width: 1440, height: 900 },
  },
});