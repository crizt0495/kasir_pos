import { test, expect } from '@playwright/test';
import { login, trackErrors } from './helpers.js';

const ROUTES = [
  { path: '/dashboard', heading: 'Dashboard' },
  { path: '/pos', heading: 'Keranjang' },
  { path: '/products', heading: 'Produk' },
  { path: '/categories', heading: 'Kategori' },
  { path: '/customers', heading: 'Pelanggan' },
  { path: '/suppliers', heading: 'Supplier' },
  { path: '/inventory', heading: 'Stok' },
  { path: '/inventory/movements', heading: 'Pergerakan Stok' },
  { path: '/inventory/opname', heading: 'Stock Opname' },
  { path: '/inventory/opname/new', heading: 'Buat Stock Opname' },
  { path: '/purchases', heading: 'Pembelian' },
  { path: '/purchases/new', heading: 'Tambah Pembelian' },
  { path: '/sales', heading: 'Riwayat Penjualan' },
  { path: '/returns', heading: 'Retur' },
  { path: '/cashier', heading: 'Kasir' },
  { path: '/expenses', heading: 'Pengeluaran' },
  { path: '/reports', heading: 'Laporan' },
  { path: '/profit-sharing', heading: 'Bagi Hasil Pelanggan 2,5%' },
  { path: '/users', heading: 'Users' },
  { path: '/users/new', heading: 'Tambah User' },
  { path: '/roles', heading: 'Roles' },
  { path: '/permissions', heading: 'Permissions' },
  { path: '/audit-logs', heading: 'Audit Log' },
  { path: '/settings', heading: 'Settings' },
  { path: '/change-password', heading: 'Ganti Password' },
];

test('Semua halaman utama dapat dimuat tanpa error (console/page/network)', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  for (const { path, heading } of ROUTES) {
    await page.goto(path);
    await page.getByRole('heading', { name: heading }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(900);
    expect(problems, `Error saat membuka ${path}:\n${problems.join('\n')}`).toEqual([]);
  }
});