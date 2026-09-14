import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD, LIMITED_PASSWORD } from './helpers/fakeSupabase.js';

const fake = createFakeSupabase();
mock.module('../src/config/supabase.js', { namedExports: { supabase: fake } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

let server;
let seq = 0;

async function loginAgent(username, password) {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return agent;
}

async function createProduct(agent, { purchasePrice = 8000, salePrice = 12000 } = {}) {
  seq += 1;
  const res = await agent.post('/api/products').send({
    sku: `PB-TEST-${Date.now()}-${seq}`,
    name: `Produk Alur Pembelian ${seq}`,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    stock: 10,
    min_stock: 0,
    status: 'active',
  });
  assert.equal(res.status, 201);
  return res.body.data.id;
}

async function createPurchase(agent, productId, costPrice = 7000) {
  const res = await agent.post('/api/purchases').send({
    invoice_number: `INV-PB-${Date.now()}-${seq}`,
    items: [{ product_id: productId, quantity: 2, cost_price: costPrice }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.message, 'Pembelian berhasil dibuat');
  return res.body.data.purchase.id;
}

async function getPurchasePrice(agent, productId) {
  const res = await agent.get(`/api/products/${productId}`);
  assert.equal(res.status, 200);
  return Number(res.body.data.purchase_price);
}

const priceMovements = (ref) => fake.store.price_movements.filter((r) => r.id_referensi === ref);

describe('Alur pembelian & pergerakan harga (REVISI: BARANG_DITERIMA + LUNAS)', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    server.close();
  });

  it('Kasus 1: buat pembelian (draft) TIDAK mengubah harga beli & tanpa pergerakan', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);

    const res = await agent.post('/api/purchases').send({
      invoice_number: `INV-PB-${Date.now()}`,
      items: [{ product_id: productId, quantity: 2, cost_price: 7000 }],
    });
    assert.equal(res.status, 201);
    const purchaseId = res.body.data.purchase.id;
    assert.equal(res.body.data.purchase.status_barang, 'DRAFT');
    assert.equal(res.body.data.purchase.payment_status, 'unpaid');

    const detail = await agent.get(`/api/purchases/${purchaseId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.status_barang, 'DRAFT');

    assert.equal(await getPurchasePrice(agent, productId), 8000);
    assert.equal(priceMovements(purchaseId).length, 0);
  });

  it('Kasus 1b: mengubah draft (edit) TIDAK mengubah harga beli', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);
    const purchaseId = await createPurchase(agent, productId, 7000);

    const res = await agent.put(`/api/purchases/${purchaseId}`).send({
      invoice_number: `INV-PB-${Date.now()}`,
      items: [{ product_id: productId, quantity: 5, cost_price: 6500 }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Pembelian berhasil diperbarui');

    assert.equal(await getPurchasePrice(agent, productId), 8000);
    assert.equal(priceMovements(purchaseId).length, 0);
  });

  it('Kasus 2: pembayaran LUNAS lalu Terima Barang → harga terupdate + pergerakan tercatat; terima ulang ditolak', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);
    const purchaseId = await createPurchase(agent, productId, 7000);

    const pay = await agent.put(`/api/purchases/${purchaseId}/payment`).send({ payment_status: 'paid' });
    assert.equal(pay.status, 200);
    assert.equal(pay.body.message, 'Status pembayaran diperbarui');
    assert.equal(pay.body.data.price_synced, false);

    const recv = await agent.post(`/api/purchases/${purchaseId}/receive`);
    assert.equal(recv.status, 200);
    assert.equal(recv.body.message, 'Pembelian berhasil diterima. Harga produk telah diupdate');
    assert.equal(recv.body.data.price_synced, true);
    assert.equal(recv.body.data.status_barang, 'BARANG_DITERIMA');

    assert.equal(await getPurchasePrice(agent, productId), 7000);

    const rows = priceMovements(purchaseId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'pembelian');
    assert.equal(Number(rows[0].old_value), 8000);
    assert.equal(Number(rows[0].new_value), 7000);

    const again = await agent.post(`/api/purchases/${purchaseId}/receive`);
    assert.equal(again.status, 400);
  });

  it('Kasus 2b: Terima Barang sebelum lunas → harga TIDAK berubah; setelah lunas harga terupdate', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);
    const purchaseId = await createPurchase(agent, productId, 7000);

    const recv = await agent.post(`/api/purchases/${purchaseId}/receive`);
    assert.equal(recv.status, 200);
    assert.equal(recv.body.data.price_synced, false);
    assert.equal(recv.body.data.price_reason, 'belum_lunas');
    assert.equal(await getPurchasePrice(agent, productId), 8000);
    assert.equal(priceMovements(purchaseId).length, 0);

    const pay = await agent.put(`/api/purchases/${purchaseId}/payment`).send({ payment_status: 'paid' });
    assert.equal(pay.status, 200);
    assert.equal(pay.body.data.price_synced, true);
    assert.equal(await getPurchasePrice(agent, productId), 7000);
    assert.equal(priceMovements(purchaseId).length, 1);
  });

  it('Kasus 3: hapus pembelian BARANG_DITERIMA → harga beli kembali & pergerakan dibersihkan', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);
    const purchaseId = await createPurchase(agent, productId, 7000);

    await agent.put(`/api/purchases/${purchaseId}/payment`).send({ payment_status: 'paid' });
    await agent.post(`/api/purchases/${purchaseId}/receive`);
    assert.equal(await getPurchasePrice(agent, productId), 7000);
    assert.equal(priceMovements(purchaseId).length, 1);

    const del = await agent.delete(`/api/purchases/${purchaseId}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Pembelian dihapus. Harga beli produk dikembalikan ke harga sebelumnya');
    assert.equal(del.body.data.price_reverted, 1);

    assert.equal(await getPurchasePrice(agent, productId), 8000);
    assert.equal(priceMovements(purchaseId).length, 0);
  });

  it('Kasus 3b: hapus pembelian DRAFT → harga tidak berubah & tanpa pergerakan', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);
    const purchaseId = await createPurchase(agent, productId, 7000);

    const del = await agent.delete(`/api/purchases/${purchaseId}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Pembelian berhasil dihapus');
    assert.equal(del.body.data.price_reverted, 0);

    assert.equal(await getPurchasePrice(agent, productId), 8000);
    assert.equal(priceMovements(purchaseId).length, 0);
  });

  it('daftar pembelian mendukung filter status_barang= DRAFT / BARANG_DITERIMA', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const productId = await createProduct(agent);
    const draftId = await createPurchase(agent, productId, 7000);
    const receivedId = await createPurchase(agent, productId, 8000);

    await agent.put(`/api/purchases/${receivedId}/payment`).send({ payment_status: 'paid' });
    await agent.post(`/api/purchases/${receivedId}/receive`);

    const drafts = await agent.get('/api/purchases?status_barang=DRAFT&page=1&pageSize=20');
    assert.equal(drafts.status, 200);
    const draftIds = drafts.body.data.items.map((p) => p.id);
    assert.ok(draftIds.includes(draftId));
    assert.ok(!draftIds.includes(receivedId));

    const received = await agent.get('/api/purchases?status_barang=BARANG_DITERIMA&page=1&pageSize=20');
    assert.equal(received.status, 200);
    const receivedIds = received.body.data.items.map((p) => p.id);
    assert.ok(receivedIds.includes(receivedId));
    assert.ok(!receivedIds.includes(draftId));
  });

  it('akses pembelian ditolak untuk user tanpa permission purchases.* → 403', async () => {
    const agent = await loginAgent('limited', LIMITED_PASSWORD);
    const res = await agent.get('/api/purchases');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });
});