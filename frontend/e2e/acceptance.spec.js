import { test, expect } from '@playwright/test';
import { login, trackErrors, assertClean } from './helpers.js';

/**
 * Acceptance E2E 7 poin (spesifikasi §42 "orang awam 100%") —
 * dijalankan pada lingkungan dengan Supabase live + backend/.env.
 *
 *   1. POS ramah orang awam: tombol jumbo BAYAR LUNAS / SIMPAN JADI HUTANG + Bantuan
 *   2. Onboarding 3 langkah tampil sekali saat pertama login
 *   3. Sidebar + badge koneksi (ONLINE/OFFLINE)
 *   4. Halaman Pelanggan sinkron: kolom "Sisa Hutang" + badge status
 *   5. Tombol Koreksi/Edit transaksi di detail penjualan
 *   6. Alur BAYAR LUNAS (F4) menghasilkan struk
 *   7. POS tetap jalan saat internet mati (offline)
 */

test.describe('Acceptance — kasir orang awam', () => {
  test('1. POS menampilkan tombol jumbo & bantuan', async ({ page }) => {
    const problems = trackErrors(page);
    await login(page);
    await page.getByRole('link', { name: 'POS' }).click();
    await expect(page).toHaveURL(/pos/);
    await expect(page.getByText('Keranjang', { exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: /BAYAR LUNAS/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /SIMPAN JADI HUTANG/ })).toBeVisible();

    await page.getByRole('button', { name: 'Bantuan' }).click();
    await expect(page.getByRole('heading', { name: 'Bantuan Cepat' })).toBeVisible();
    await page.getByRole('button', { name: 'Tutup' }).click();

    assertClean(problems);
  });

  test('2. Onboarding 3 langkah tampil sekali', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Masukkan username').fill('admin');
    await page.getByPlaceholder('Masukkan password').fill('Admin2026!x');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL(/\/dashboard/);

    await expect(page.getByText('Mengenal Kasir')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await page.getByRole('button', { name: /Selesai, Mulai/ }).click();
    await expect(page.getByText('Mengenal Kasir')).toBeHidden();

    await page.reload();
    await expect(page.getByText('Mengenal Kasir')).toBeHidden({ timeout: 5000 });
  });

  test('3. Sidebar & badge koneksi tampil', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('link', { name: 'POS / Kasir' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /ONLINE|OFFLINE/ }).first()).toBeVisible();
  });

  test('4. Sisa Hutang sinkron di halaman Pelanggan', async ({ page }) => {
    const problems = trackErrors(page);
    await login(page);
    await page.getByRole('link', { name: 'Pelanggan' }).click();
    await expect(page.getByRole('heading', { name: 'Pelanggan' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sisa Hutang' })).toBeVisible();
    await expect(page.getByText(/SUDAH LUNAS|MASIH ADA HUTANG/).first()).toBeVisible();
    assertClean(problems);
  });

  test('5. Tombol Koreksi tersedia di detail penjualan', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Penjualan' }).click();
    await expect(page.getByRole('heading', { name: 'Riwayat Penjualan' })).toBeVisible();

    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.locator('button').first().click();
      await expect(page.getByRole('button', { name: /Koreksi/ })).toBeVisible({ timeout: 10000 });
    }
  });

  test('6. BAYAR LUNAS (F4) menghasilkan struk', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'POS' }).click();
    await expect(page.getByText('Keranjang', { exact: true })).toBeVisible();

    const product = page.locator('[role="button"][aria-disabled="false"]').first();
    await expect(product).toBeVisible({ timeout: 10000 });
    await product.click();

    await page.getByRole('button', { name: /BAYAR LUNAS/ }).click();
    await expect(page.getByText('Grand Total')).toBeVisible();
    await page.getByTestId('cash-received').fill('9999999');
    await page.getByRole('button', { name: /Proses Pembayaran/ }).click();

    await expect(page.getByText('Struk Transaksi')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Terima kasih')).toBeVisible();
  });

  test('7. POS tetap jalan saat internet mati', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'POS' }).click();
    await expect(page.getByText('Keranjang', { exact: true })).toBeVisible();

    const product = page.locator('[role="button"][aria-disabled="false"]').first();
    await product.click();

    await page.context().setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: /OFFLINE/ }).first()).toBeVisible({ timeout: 20000 });

    const addBtn = page.locator('[role="button"][aria-disabled="false"]').first();
    if (await addBtn.isVisible().catch(() => false)) await addBtn.click();
    await expect(page.getByText('Keranjang', { exact: true })).toBeVisible();

    await page.context().setOffline(false);
  });
});
