import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD, LIMITED_PASSWORD } from './helpers/fakeSupabase.js';

mock.module('../src/config/supabase.js', { namedExports: { supabase: createFakeSupabase() } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

let server;

async function loginAgent(username, password) {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return agent;
}

describe('Products CRUD + authorization', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    server.close();
  });

  it('daftar produk (owner) → 200 dengan pagination', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.get('/api/products?page=1&pageSize=10');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.equal(typeof res.body.data.total, 'number');
  });

  it('membuat produk dengan validasi: harga negatif ditolak → 422', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/products').send({
      sku: 'BRG-X1',
      name: 'Produk Baru',
      sale_price: -1000,
      purchase_price: 0,
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('membuat produk tanpa nama → 422', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/products').send({ sku: 'BRG-X2', name: '', sale_price: 1000 });
    assert.equal(res.status, 422);
  });

  it('user terbatas tidak boleh membuat produk (tanpa products.create) → 403', async () => {
    const agent = await loginAgent('limited', LIMITED_PASSWORD);
    const res = await agent.post('/api/products').send({ sku: 'BRG-X3', name: 'Test', sale_price: 1000 });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  it('mencari produk dengan barcode → ditemukan', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.get('/api/products/barcode/8991001000001');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Produk Test');
  });

  it('barcode tidak dikenal → 404 dengan pesan ramah', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.get('/api/products/barcode/000000');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });

  it('penyesuaian stok butuh permission inventory.adjust — admin punya → 200', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/inventory/adjust').send({
      product_id: '99999999-9999-9999-9999-999999999999',
      quantity: 5,
      reason: 'Stok fisik bertambah',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.delta, 5);
  });

  it('penyesuaian stok tanpa alasan → 422', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/inventory/adjust').send({
      product_id: '99999999-9999-9999-9999-999999999999',
      quantity: 5,
      reason: 'ab',
    });
    assert.equal(res.status, 422);
  });

  it('transaksi penjualan valid → 201 dengan invoice number', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/sales').send({
      items: [{ product_id: '99999999-9999-9999-9999-999999999999', quantity: 1, price: 15000, discount: 0 }],
      payment_method: 'CASH',
      cash_received: 20000,
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.invoice_number);
    assert.equal(res.body.data.change, 5000);
  });

  it('transaksi tanpa item → 422', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/sales').send({ items: [], payment_method: 'CASH' });
    assert.equal(res.status, 422);
  });

  it('laporan penjualan → 200 dengan bucket', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.get('/api/reports/sales?period=daily');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.buckets));
    assert.ok(res.body.data.totals);
  });
});
