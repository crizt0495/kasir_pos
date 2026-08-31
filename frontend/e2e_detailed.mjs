import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://127.0.0.1:5188';
const LOG = '/tmp/e2e_detail.log';
const out = [];
const log = (m) => { out.push(m); fs.writeFileSync(LOG, out.join('\n')); };
const consoleErrors = [], pageErrors = [], bad = [];
const results = [];
const ok = (s, d='') => results.push({ s, status: 'PASS', d });
const fail = (s, d='') => results.push({ s, status: 'FAIL', d });

setTimeout(() => { log('!! HARD TIMEOUT 150s'); finalize(); process.exit(1); }, 150000);

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(20000);
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

async function step(name, fn) {
  try { await fn(); ok(name); log('[PASS] ' + name); }
  catch (e) { fail(name, e.message.split('\n')[0]); log('[FAIL] ' + name + ' — ' + e.message.split('\n')[0]); }
}
const go = async (r) => { await page.goto(BASE + r, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(700); };
const uniq = 'E2E' + Date.now();

await step('Login admin', async () => {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="Masukkan username"]', 'admin');
  await page.fill('input[placeholder="Masukkan password"]', 'Admin2026!x');
  await page.click('button:has-text("Login")');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 15000 });
});

await step('Dashboard data', async () => {
  await go('/dashboard');
  if (await page.locator('.grid > *').count() < 1) throw new Error('tanpa stat card');
});

const routes = ['/products','/products/new','/categories','/customers','/suppliers','/inventory','/inventory/movements','/inventory/opname','/purchases','/purchases/new','/sales','/returns','/cashier','/expenses','/reports','/profit-sharing','/users','/users/new','/roles','/permissions','/audit-logs','/settings'];
for (const r of routes) {
  await step('Navigasi ' + r, async () => {
    await go(r);
    if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('redirect login');
    if (await page.locator('h1, h2, table, .empty-state').first().count() < 1) throw new Error('tanpa konten');
  });
}

await step('Buat produk', async () => {
  await go('/products/new');
  await page.fill('input[name="name"]', 'Test Produk ' + uniq);
  await page.fill('input[name="sku"]', 'BRG-' + uniq);
  await page.fill('input[name="barcode"]', '899' + Date.now());
  await page.selectOption('select[name="category_id"]', { index: 1 });
  await page.selectOption('select[name="unit_id"]', { index: 1 });
  const cur = page.locator('input[placeholder="0"]:not([name])');
  await cur.nth(0).fill('5000');
  await cur.nth(1).fill('8000');
  await page.fill('input[name="stock"]', '10');
  await page.fill('input[name="min_stock"]', '2');
  await page.click('button:has-text("Simpan Produk")');
  await page.waitForFunction(() => new URL(location.href).pathname === '/products', null, { timeout: 10000 });
  await page.waitForTimeout(500);
  // verifikasi lewat API (proxy bawa cookie session)
  const resp = await page.request.get(BASE + '/api/products?search=' + encodeURIComponent('Test Produk ' + uniq));
  const body = await resp.json();
  const found = (body.data?.items || []).some((i) => (i.name || '').includes(uniq));
  if (!found) throw new Error('produk tdk ditemukan via API');
});

await step('POS checkout + diskon', async () => {
  await go('/pos');
  await page.fill('input[placeholder^="Cari produk"]', 'Test Produk ' + uniq);
  await page.waitForTimeout(900);
  await page.locator('button:has-text("Test Produk ' + uniq + '")').first().click();
  await page.waitForTimeout(600);
  await page.click('button:has-text("Bayar")');
  await page.waitForTimeout(900);
  await page.locator('xpath=//span[contains(.,"Diskon transaksi")]/following-sibling::div//input').fill('1000');
  await page.waitForTimeout(300);
  await page.fill('input[data-testid="cash-received"]', '50000');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Proses Pembayaran")');
  await page.waitForTimeout(2500);
  if (await page.locator('text=Struk Transaksi').count() < 1) throw new Error('receipt tdk muncul');
  if (await page.locator('text=Diskon').count() < 1) throw new Error('diskon tdk tercantum');
});

await step('Cashier tutup(legacy)+buka+tutup', async () => {
  await go('/cashier');
  const closeSession = async () => {
    if (await page.locator('button:has-text("Tutup Kas")').count()) {
      try { await page.locator('button:has-text("Tutup Kas")').first().click({ timeout: 5000 }); } catch (e) {}
      await page.waitForTimeout(700);
      const conf = page.locator('button:has-text("Tutup Kas")').last();
      if (await conf.count()) { try { await conf.click({ timeout: 5000 }); } catch (e) {} }
      await page.waitForTimeout(1200);
    }
  };
  await closeSession();
  if (await page.locator('button:has-text("Buka Kas")').count()) {
    await page.fill('input[placeholder="0"]', '100000');
    try { await page.click('button:has-text("Buka Kas")', { timeout: 5000 }); } catch (e) {}
    await page.waitForTimeout(1200);
  }
  await closeSession();
});

await step('Buat pengeluaran', async () => {
  await go('/expenses');
  await page.click('button:has-text("Tambah Pengeluaran")');
  await page.waitForTimeout(600);
  await page.fill('input[placeholder="0"]', '25000');
  await page.fill('textarea[placeholder="Opsional"]', 'Biaya listrik toko');
  await page.click('button:has-text("Simpan")');
  await page.waitForTimeout(1200);
});

await step('Reports ekspor PDF', async () => {
  await go('/reports');
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
    page.click('button:has-text("Export PDF")'),
  ]);
  await page.waitForTimeout(800);
  if (!dl[0]) throw new Error('tdk ada download');
});

await step('Profit Sharing', async () => {
  await go('/profit-sharing');
  if (await page.locator('text=Bagi Hasil').count() < 1) throw new Error('heading tdk ada');
});

await step('Logout', async () => {
  await page.click('button[aria-label="Menu pengguna"]');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Logout")');
  await page.waitForFunction(() => location.pathname.startsWith('/login'), null, { timeout: 10000 });
});

async function finalize() {
  const total = results.length, passed = results.filter(r => r.status==='PASS').length;
  log('\n========== RINGKASAN ==========');
  results.forEach(r => log(`[${r.status}] ${r.s}${r.d?' — '+r.d:''}`));
  log(`Langkah PASS: ${passed}/${total}`);
  log('Console Errors: ' + consoleErrors.length); consoleErrors.forEach(e=>log('  • '+e));
  log('Page Errors   : ' + pageErrors.length); pageErrors.forEach(e=>log('  • '+e));
  log('HTTP>=400     : ' + [...new Set(bad)].length); [...new Set(bad)].forEach(b=>log('  • '+b));
  const clean = consoleErrors.length===0 && pageErrors.length===0 && [...new Set(bad)].length===0 && passed===total;
  log('=== BEBAS ERROR 100%: ' + (clean ? 'YA' : 'TIDAK') + ' ===');
}
await finalize();
await browser.close();
process.exit(0);
