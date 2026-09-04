import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD } from './helpers/fakeSupabase.js';

mock.module('../src/config/supabase.js', { namedExports: { supabase: createFakeSupabase() } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

let server;
let agent;

describe('Reports (semua jenis laporan)', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    agent = request.agent(server);
    await agent.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
  });

  after(async () => {
    server.close();
  });

  it('dashboard summary → 200 dengan seluruh field numerik valid', async () => {
    const res = await agent.get('/api/dashboard/summary');
    assert.equal(res.status, 200);
    const d = res.body.data;
    for (const k of [
      'today_sales',
      'today_gross_sales',
      'today_transactions',
      'today_refund',
      'today_profit',
      'total_products',
      'low_stock',
      'out_of_stock',
      'total_customers',
      'purchases_today',
      'open_cash',
      'total_pending_debt',
      'pending_debt_count',
      'today_paid_debt',
      'today_new_debt',
    ]) {
      assert.equal(typeof d[k], 'number', `${k} harus number`);
    }
    assert.equal(d.today_gross_sales - d.today_refund, d.today_sales);
  });

  it('dashboard charts → 200 dengan shape valid', async () => {
    const res = await agent.get('/api/dashboard/charts');
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.ok(Array.isArray(d.sales_7_days));
    assert.equal(d.sales_7_days.length, 7);
    assert.equal(typeof d.payment_methods, 'object');
    assert.ok(Array.isArray(d.top_products));
    assert.ok(Array.isArray(d.category_sales));
  });

  it('laporan penjualan → 200 (sudah ada sebelumnya)', async () => {
    const res = await agent.get('/api/reports/sales?period=daily');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.buckets));
  });

  it('laporan produk (terlaris & paling sedikit) → 200', async () => {
    const res = await agent.get('/api/reports/products');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.top));
    assert.ok(Array.isArray(res.body.data.least));
  });

  it('laporan stok → 200 dengan ringkasan', async () => {
    const res = await agent.get('/api/reports/inventory');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.totals.total_products, 'number');
    assert.ok(Array.isArray(res.body.data.movements));
  });

  it('laporan kasir → 200', async () => {
    const res = await agent.get('/api/reports/cashier');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.cashiers));
  });

  it('laporan pembelian → 200 dengan total', async () => {
    const res = await agent.get('/api/reports/purchases');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.totals.total, 'number');
  });

  it('laporan profit → 200 dengan bucket & totals', async () => {
    const res = await agent.get('/api/reports/profit?period=daily');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.buckets));
    assert.equal(typeof res.body.data.totals.profit, 'number');
  });

  it('laporan dengan rentang custom → 200', async () => {
    const res = await agent.get('/api/reports/products?from=2026-01-01&to=2026-12-31');
    assert.equal(res.status, 200);
  });

  it('export CSV laporan penjualan → content-type CSV', async () => {
    const res = await agent.get('/api/reports/sales?period=daily&export=csv');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
  });
});
