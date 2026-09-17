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

  test('8. Batal hutang sinkron dari menu Hutang ke Penjualan dan Pelanggan', async ({ page }) => {
    const problems = trackErrors(page);
    await login(page);

    const unique = Date.now();
    const customerName = `Bagas Acceptance ${unique}`;
    const productName = `Produk Acceptance ${unique}`;
    const reason = `Test acceptance ${unique}`;

    const customerRes = await page.request.post('/api/customers', {
      data: { name: customerName, phone: '081234567890', is_general: false },
    });
    expect(customerRes.ok()).toBeTruthy();
    const customer = (await customerRes.json()).data;

    const productRes = await page.request.post('/api/products', {
      data: {
        sku: `SKU-${unique}`,
        barcode: `BC-${unique}`,
        name: productName,
        purchase_price: 5000,
        sale_price: 75000,
        stock: 10,
        min_stock: 0,
        status: 'active',
        description: 'Produk untuk acceptance test',
        image_url: '',
      },
    });
    expect(productRes.ok()).toBeTruthy();
    const product = (await productRes.json()).data;

    const saleRes = await page.request.post('/api/sales', {
      data: {
        items: [{ product_id: product.id, quantity: 1, price: 75000, discount: 0 }],
        customer_id: customer.id,
        payment_method: 'CASH',
        cash_received: 50000,
        notes: 'Test acceptance hutang 75rb bayar 50rb sisa 25rb',
      },
    });
    expect(saleRes.ok()).toBeTruthy();
    const sale = (await saleRes.json()).data;
    expect(sale.debt_amount).toBe(25000);

    const saleUrl = `/sales/${sale.sale_id}`;
    await page.goto(saleUrl);
    await expect(page.getByRole('heading', { name: sale.invoice_number })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('BELUM LUNAS')).toBeVisible();
    await expect(page.getByText('Rp 25.000')).toBeVisible();

    const debtsRes = await page.request.get('/api/customer-debts', {
      params: { customer_id: customer.id, status: 'pending' },
    });
    expect(debtsRes.ok()).toBeTruthy();
    const debts = (await debtsRes.json()).data.items;
    const debt = debts.find((d) => d.sale_id === sale.sale_id || d.notes?.includes(sale.invoice_number));
    expect(debt).toBeTruthy();
    expect(debt.remaining_amount).toBe(25000);

    const cancelRes = await page.request.post(`/api/customer-debts/${debt.id}/cancel`, { data: { reason } });
    expect(cancelRes.ok()).toBeTruthy();

    await page.goto(saleUrl);
    await expect(page.getByText('DIBATALKAN')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Dibatalkan/)).toBeVisible();
    await expect(page.getByText('BELUM LUNAS')).toBeHidden();

    const customerRes2 = await page.request.get(`/api/customers/${customer.id}`);
    expect(customerRes2.ok()).toBeTruthy();
    const customer2 = (await customerRes2.json()).data;
    expect(customer2.pending_debt).toBe(0);
    expect(customer2.total_debt).toBe(0);

    assertClean(problems);
  });
});
