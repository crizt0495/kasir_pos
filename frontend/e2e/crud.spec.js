import { test, expect } from '@playwright/test';
import { login, trackErrors, fieldControl, uniqName } from './helpers.js';

test('CRUD kategori: buat → edit → hapus', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  const name = uniqName('E2E Kategori');
  await page.goto('/categories');
  await page.getByRole('heading', { name: 'Kategori', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Tambah Kategori', exact: true }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Tambah Kategori' });
  await fieldControl(createDialog, 'Nama Kategori').fill(name);
  await createDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Kategori berhasil dibuat')).toBeVisible();

  const search = page.getByPlaceholder('Cari kategori...');
  await search.fill(name);
  const row = page.locator('tbody tr').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText('Aktif');

  await row.locator('button:has(svg.lucide-pencil)').click();
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Edit Kategori' });
  await fieldControl(editDialog, 'Deskripsi').fill('dideskripsikan oleh E2E');
  await editDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Kategori berhasil diperbarui')).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row).toContainText('dideskripsikan oleh E2E');

  await row.locator('button:has(svg.lucide-trash2)').click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Hapus kategori ini?' })
    .getByRole('button', { name: 'Ya, lanjutkan', exact: true })
    .click();
  await expect(page.getByText('Kategori berhasil dihapus')).toBeVisible();
  await expect(row).toBeHidden();

  expect(problems).toEqual([]);
});

test('CRUD pelanggan: buat → edit → hapus', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  const name = uniqName('E2E Pelanggan');
  const phone = `08${Date.now().toString().slice(-9)}`;
  await page.goto('/customers');
  await page.getByRole('heading', { name: 'Pelanggan', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Tambah Pelanggan', exact: true }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Tambah Pelanggan' });
  await fieldControl(createDialog, 'Nama').fill(name);
  await fieldControl(createDialog, 'No. HP').fill(phone);
  await fieldControl(createDialog, 'Email').fill(`${Date.now()}@e2e.test`);
  await createDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Pelanggan berhasil dibuat')).toBeVisible();

  const search = page.getByPlaceholder('Cari nama, HP, email...');
  await search.fill(name);
  const row = page.locator('tbody tr').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText(phone);

  await row.locator('button:has(svg.lucide-pencil)').click();
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Edit Pelanggan' });
  const newPhone = `0899${Date.now().toString().slice(-7)}`;
  await fieldControl(editDialog, 'No. HP').fill(newPhone);
  await editDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Pelanggan berhasil diperbarui')).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row).toContainText(newPhone);

  await row.locator('button:has(svg.lucide-trash2)').click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Hapus pelanggan ini?' })
    .getByRole('button', { name: 'Ya, lanjutkan', exact: true })
    .click();
  await expect(page.getByText('Pelanggan berhasil dihapus')).toBeVisible();
  await expect(row).toBeHidden();

  expect(problems).toEqual([]);
});

test('CRUD supplier: buat → edit → hapus', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  const name = uniqName('E2E Supplier');
  await page.goto('/suppliers');
  await page.getByRole('heading', { name: 'Supplier', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Tambah Supplier', exact: true }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Tambah Supplier' });
  await fieldControl(createDialog, 'Nama Supplier').fill(name);
  await fieldControl(createDialog, 'Telepon').fill(`021${Date.now().toString().slice(-7)}`);
  await createDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Supplier berhasil dibuat')).toBeVisible();

  const search = page.getByPlaceholder('Cari nama, telepon...');
  await search.fill(name);
  const row = page.locator('tbody tr').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText('Aktif');

  await row.locator('button:has(svg.lucide-pencil)').click();
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Edit Supplier' });
  await fieldControl(editDialog, 'Status').selectOption('inactive');
  await editDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Supplier berhasil diperbarui')).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Nonaktif');

  await row.locator('button:has(svg.lucide-trash2)').click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Hapus supplier ini?' })
    .getByRole('button', { name: 'Ya, lanjutkan', exact: true })
    .click();
  await expect(page.getByText('Supplier berhasil dihapus')).toBeVisible();
  await expect(row).toBeHidden();

  expect(problems).toEqual([]);
});

test('CRUD pengeluaran: buat → edit → hapus', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  const description = uniqName('E2E biaya operasional');
  await page.goto('/expenses');
  await page.getByRole('heading', { name: 'Pengeluaran', exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Tambah Pengeluaran', exact: true }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Tambah Pengeluaran' });
  await fieldControl(createDialog, 'Nominal').fill('50000');
  await fieldControl(createDialog, 'Deskripsi').fill(description);
  await createDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Pengeluaran berhasil dicatat')).toBeVisible();

  const search = page.getByPlaceholder('Cari deskripsi...');
  await search.fill(description);
  const row = page.locator('tbody tr').filter({ hasText: description });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText('-Rp');

  await row.locator('button:has(svg.lucide-pencil)').click();
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Edit Pengeluaran' });
  await fieldControl(editDialog, 'Kategori').selectOption('Listrik & Air');
  await editDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Pengeluaran berhasil diperbarui')).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Listrik & Air');

  await row.locator('button:has(svg.lucide-trash2)').click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Hapus pengeluaran?' })
    .getByRole('button', { name: 'Ya, hapus', exact: true })
    .click();
  await expect(page.getByText('Pengeluaran dihapus')).toBeVisible();
  await expect(row).toBeHidden();

  expect(problems).toEqual([]);
});

test('CRUD produk: buat → saring → hapus', async ({ page }) => {
  const problems = trackErrors(page);
  await login(page);

  const name = uniqName('E2E Produk');
  const sku = `E2E-${Date.now()}`;
  await page.goto('/products/new');
  await page.getByRole('heading', { name: 'Tambah Produk', exact: true }).waitFor({ state: 'visible' });

  const form = page.locator('form').first();
  await fieldControl(form, 'Nama Produk').fill(name);
  await fieldControl(form, 'SKU').fill(sku);

  try {
    await fieldControl(form, 'Kategori').selectOption({ index: 1 });
  } catch {
    await form.getByRole('button', { name: 'Tambah kategori', exact: true }).click();
    const catDialog = page.getByRole('dialog').filter({ hasText: 'Tambah Kategori' });
    await fieldControl(catDialog, 'Nama Kategori').fill(uniqName('E2E Kat'));
    await catDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Kategori berhasil dibuat')).toBeVisible();
  }

  try {
    await fieldControl(form, 'Satuan').selectOption({ index: 1 });
  } catch {
    await form.getByRole('button', { name: 'Tambah satuan', exact: true }).click();
    const unitDialog = page.getByRole('dialog').filter({ hasText: 'Tambah Satuan' });
    await fieldControl(unitDialog, 'Nama Satuan').fill('E2E Dus');
    await fieldControl(unitDialog, 'Singkatan').fill('Dus');
    await unitDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Satuan berhasil dibuat')).toBeVisible();
  }

  await fieldControl(form, 'Harga Beli').fill('10000');
  await fieldControl(form, 'Harga Jual').fill('15000');
  await fieldControl(form, 'Stok Awal').fill('10');
  await fieldControl(form, 'Stok Minimum').fill('2');
  await form.getByRole('button', { name: 'Simpan Produk', exact: true }).click();
  await expect(page.getByText('Produk berhasil dibuat')).toBeVisible();
  await page.waitForURL(/\/products$/);

  const search = page.getByPlaceholder('Cari nama, SKU, barcode...');
  await search.fill(sku);
  const row = page.locator('tbody tr').filter({ hasText: sku });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText(name);

  await row.locator('button:has(svg.lucide-trash2)').click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Hapus produk ini?' })
    .getByRole('button', { name: 'Ya, hapus', exact: true })
    .click();
  await expect(page.getByText('Produk berhasil dihapus')).toBeVisible();
  await expect(row).toBeHidden();

  expect(problems).toEqual([]);
});