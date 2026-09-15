import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

/**
 * Revisi 9 — Pencarian SKU + Auto-Add ENTER di POS (full keyboard, tanpa mouse).
 *
 * Pemetaan kriteri acceptance ke seed.sql (Toko seed memakai SKU BRG-0001..0006):
 *   1) ketik sku (case-insensitive) + ENTER → produk unik masuk keranjang
 *      (padanan Test "mtj" → Madu TJ)
 *   2) ketik hasil banyak + ENTER → produk pertama (urutan nama) masuk
 *      (padanan Test "ma" / "G" → produk paling atas)
 *   3) ketik angka barcode + ENTER → tetap jalan (scan barcode normal)
 *
 * Prasyarat: backend+Supabase terhubung dengan seed.sql terpasang.
 */
test('POS: ketik SKU/nama + ENTER → auto-add, input fokus lagi (revisi 9)', async ({ page }) => {
  await login(page);

  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: 'Keranjang', exact: true })).toBeVisible();
  const search = page.getByPlaceholder('Cari produk');

  // ---------- (1) SKU + ENTER, case-insensitive → 1 produk unik ----------
  await search.fill('brg-0001');
  await search.press('Enter');
  await expect(page.locator('li', { hasText: 'Kopi Kapal Api 200gr' }).first()).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  // ---------- (2) Hasil banyak + ENTER → produk pertama (nama teratas) ----------
  await search.fill('BRG-000');
  await search.press('Enter');
  await expect(page.locator('li', { hasText: 'Air Mineral 600ml' }).first()).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  // ---------- (3) Barcode angka + ENTER → scan tetap normal ----------
  await search.fill('8991001000002');
  await search.press('Enter');
  await expect(page.locator('li', { hasText: 'Indomie Goreng' }).first()).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
});