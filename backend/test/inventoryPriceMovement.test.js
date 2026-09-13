import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD } from './helpers/fakeSupabase.js';

const PRODUCT_ID = '99999999-9999-9999-9999-999999999999';

const fakeSB = createFakeSupabase();

// Seeding: bayangkan tabel price_movements sudah ada dari migrasi 0034
await fakeSB.from('price_movements').insert([
  {
    id: 'pm-00000000-0000-0000-0000-000000000001',
    product_id: PRODUCT_ID,
    price_type: 'sale_price',
    old_value: 15000,
    new_value: 18000,
    difference: 3000,
    source: 'edit_produk',
    changed_by: null,
    changed_by_name: 'admin',
    created_at: '2026-09-13T02:00:00Z',
  },
  {
    id: 'pm-00000000-0000-0000-0000-000000000002',
    product_id: PRODUCT_ID,
    price_type: 'purchase_price',
    old_value: 10000,
    new_value: 12000,
    difference: 2000,
    source: 'pembelian',
    changed_by: null,
    changed_by_name: 'admin',
    created_at: '2026-09-13T01:00:00Z',
  },
]);

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

let server;

async function loginAgent() {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

describe('Inventory — Pergerakan Harga', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    server.close();
  });

  it('list harga default → 200, diurutkan created_at menurun', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/api/inventory/price-movements?page=1&pageSize=25');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    assert.equal(res.body.data.items.length, 2);
    assert.equal(res.body.data.items[0].price_type, 'sale_price');
    assert.equal(res.body.data.items[1].price_type, 'purchase_price');
  });

  it('filter price_type=purchase_price hanya mengembalikan harga beli', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/api/inventory/price-movements?page=1&pageSize=25&price_type=purchase_price');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    assert.equal(res.body.data.items[0].price_type, 'purchase_price');
    assert.equal(res.body.data.items[0].source, 'pembelian');
  });

  it('search=admin mencocokkan nama user pengubah (changed_by_name)', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/api/inventory/price-movements?page=1&pageSize=25&search=admin');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    assert.ok(res.body.data.items.every((m) => String(m.changed_by_name || '').toLowerCase().includes('admin')));
  });

  it('search tanpa hasil → 200 dengan daftar kosong', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/api/inventory/price-movements?page=1&pageSize=25&search=tidakada');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 0);
    assert.equal(res.body.data.items.length, 0);
  });
});