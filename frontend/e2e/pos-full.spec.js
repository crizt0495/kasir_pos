import { test, expect } from '@playwright/test';
import { login, trackErrors, fieldControl } from './helpers.js';

test('POS lengkap: diskon · pajak · biaya tambahan → struk → detail → retur', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  await page.getByRole('link', { name: 'POS' }).click();
  await page.getByText('Keranjang', { exact: true }).waitFor({ state: 'visible' });

  await page.getByPlaceholder('Cari produk (F2)...').fill('Indomie');
  await page.locator('button', { hasText: 'Indomie Goreng' }).first().click();
  await expect(page.locator('li', { hasText: 'Indomie Goreng' })).toBeVisible();

  const discountRow = page.getByText('Diskon transaksi', { exact: true }).locator('xpath=..');
  await discountRow.locator('input').last().fill('500');

  const taxRow = page.getByText('Pajak', { exact: true }).locator('xpath=..');
  if ((await taxRow.textContent()).includes('Nonaktif')) {
    await taxRow.locator('button').click();
  }
  await expect(taxRow).toContainText('%');

  await page.getByRole('button', { name: /Bayar/ }).click();
  const checkout = page.getByRole('dialog').filter({ hasText: 'Checkout & Pembayaran' });
  await checkout.getByText('Grand Total', { exact: true }).waitFor({ state: 'visible' });

  const costRow = checkout.getByText('Biaya tambahan', { exact: true }).locator('xpath=..');
  await costRow.locator('input').last().fill('2000');

  await checkout.getByTestId('cash-received').fill('100000');
  await checkout.getByRole('button', { name: /Proses Pembayaran/ }).click();

  const receipt = page.getByRole('dialog').filter({ hasText: 'Struk Transaksi' });
  await receipt.getByText('Terima kasih').waitFor({ state: 'visible', timeout: 15_000 });
  const inv = (await receipt.getByText(/INV-[A-Z0-9-]+/).first().textContent()).match(/INV-[A-Z0-9-]+/)[0];
  await page.keyboard.press('Escape');

  await page.goto('/sales');
  await page.getByRole('heading', { name: 'Riwayat Penjualan', exact: true }).waitFor({ state: 'visible' });
  await page.getByPlaceholder('Cari no. transaksi...').fill(inv);
  const saleRow = page.locator('tbody tr').filter({ hasText: inv });
  await expect(saleRow).toBeVisible({ timeout: 10_000 });
  await saleRow.locator('button:has(svg.lucide-eye)').first().click();
  await expect(page.getByRole('heading', { name: inv })).toBeVisible({ timeout: 15_000 });
  await page.getByText('Item Transaksi', { exact: true }).waitFor({ state: 'visible' });
  await expect(page.getByText('Selesai', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Retur', exact: true }).click();
  const refund = page.getByRole('dialog').filter({ hasText: 'Retur Penjualan' });
  await refund.locator('input[placeholder="0"]').first().fill('1');
  await fieldControl(refund, 'Alasan Retur').fill('produk rusak saat uji E2E');
  await refund.getByRole('button', { name: /Refund/ }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Konfirmasi retur?' })
    .getByRole('button', { name: 'Ya, proses retur', exact: true })
    .click();
  await expect(page.getByText('Retur berhasil diproses — stok bertambah')).toBeVisible({ timeout: 15_000 });
  await page.getByText('Riwayat Retur', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByText('Diretur', { exact: true })).toBeVisible({ timeout: 10_000 });

  expect(problems).toEqual([]);
});