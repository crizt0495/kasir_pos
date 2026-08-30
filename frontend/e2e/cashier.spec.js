import { test, expect } from '@playwright/test';
import { login, trackErrors, fieldControl, parseRupiah } from './helpers.js';

test('Kasir: buka sesi (jika perlu) → tambah IN/OUT → tutup sesi', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  await page.goto('/cashier');
  await page.getByRole('heading', { name: 'Kasir', exact: true }).waitFor({ state: 'visible' });

  const openBtn = page.getByRole('button', { name: 'Buka Kas', exact: true });
  if (await openBtn.isVisible().catch(() => false)) {
    await fieldControl(page.locator('body'), 'Saldo Awal').fill('100000');
    await openBtn.click();
    await expect(page.getByText('Sesi kas dibuka')).toBeVisible({ timeout: 10_000 });
  }

  await page.getByText('Kas Yang Diharapkan', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  await page.getByRole('button', { name: 'Tambah IN/OUT', exact: true }).click();
  const txIn = page.getByRole('dialog').filter({ hasText: 'Tambah Transaksi Kas' });
  await fieldControl(txIn, 'Nominal').fill('25000');
  await txIn.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Transaksi kas ditambahkan').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Cash Masuk', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Tambah IN/OUT', exact: true }).click();
  const txOut = page.getByRole('dialog').filter({ hasText: 'Tambah Transaksi Kas' });
  await txOut.getByRole('button', { name: 'Cash Keluar (OUT)', exact: true }).click();
  await fieldControl(txOut, 'Nominal').fill('10000');
  await txOut.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Transaksi kas ditambahkan').last()).toBeVisible();
  await expect(page.getByText('Cash Keluar', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Tutup Kas', exact: true }).click();
  const closeModal = page.getByRole('dialog').filter({ hasText: 'Tutup Sesi Kas' });
  const expectedText = await page
    .getByText('Kas yang Diharapkan', { exact: true })
    .locator('xpath=..')
    .locator('span')
    .last()
    .textContent();
  const expected = parseRupiah(expectedText);
  const actual = Math.max(expected, 0);
  await fieldControl(closeModal, 'Kas Aktual').fill(String(actual));
  await fieldControl(closeModal, 'Catatan').fill('penyesuaian kas pada pengujian E2E');
  await closeModal.getByRole('button', { name: 'Tutup Kas', exact: true }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Tutup sesi kas?' })
    .getByRole('button', { name: 'Ya, tutup kas', exact: true })
    .click();
  await expect(page.getByText('Sesi kas ditutup')).toBeVisible({ timeout: 15_000 });

  expect(problems).toEqual([]);
});