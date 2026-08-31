import { test, expect } from '@playwright/test';

/**
 * Alur E2E minimal (spesifikasi §42):
 * Login → Open POS → Add Product → Checkout → Payment → Transaction Success → Stock berkurang
 *
 * Catatan: test memakai akun seed admin (wajib sudah mengganti password,
 * atau set must_change_password=false di database untuk keperluan test).
 */
test('Alur penjualan lengkap: login → POS → checkout → transaksi sukses', async ({ page }) => {
  // ---------- Login ----------
  await page.goto('/login');
  await page.getByPlaceholder('Masukkan username').fill('admin');
  await page.getByPlaceholder('Masukkan password').fill('Admin2026!x');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // ---------- Buka POS ----------
  await page.getByRole('link', { name: 'POS' }).click();
  await expect(page).toHaveURL(/pos/);
  await expect(page.getByText('Keranjang', { exact: true })).toBeVisible();

  // ---------- Cari & tambah produk ----------
  await page.getByPlaceholder('Cari produk (F2)...').fill('Indomie');
  const productCard = page.locator('button', { hasText: 'Indomie Goreng' }).first();
  await productCard.click();
  await expect(page.locator('text=Indomie Goreng').first()).toBeVisible();

  // ---------- Checkout & pembayaran ----------
  await page.getByRole('button', { name: /Bayar/ }).click();
  await expect(page.getByText('Grand Total')).toBeVisible();

  // Bayar tunai — masukkan jumlah yang cukup
  await page.getByTestId('cash-received').fill('50000');
  await page.getByRole('button', { name: /Proses Pembayaran/ }).click();

  // ---------- Transaksi sukses + struk ----------
  await expect(page.getByText('Struk Transaksi')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('INV-')).toBeVisible();
  await expect(page.getByText('Terima kasih')).toBeVisible();
});
