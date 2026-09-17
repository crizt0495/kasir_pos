import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD } from './helpers/fakeSupabase.js';

mock.module('../src/config/supabase.js', { namedExports: { supabase: createFakeSupabase() } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

let server;

const CUSTOMER_1 = 'cccc0000-0000-0000-0000-000000000001';
// Debt fixture: 50.000 pending (belum dibayar) + 100.000 partial (sisa 60.000)
// → sisa hutang live = 110.000, total hutang = 150.000

async function loginAgent(username, password) {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return agent;
}

describe('Sisa Hutang — single source of truth (getSisaHutang)', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    server.close();
  });

  it('list pelanggan → sisa_hutang & pending_debt dihitung LIVE dari customer_debts', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.get('/api/customers');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    const target = res.body.data.items.find((c) => c.id === CUSTOMER_1);
    assert.ok(target, 'pelanggan fixture harus ada di hasil list');
    // 50.000 (pending) + 60.000 (partial sisa) = 110.000
    assert.equal(target.sisa_hutang, 110000);
    assert.equal(target.pending_debt, 110000);
    // total = sum amount non-cancelled = 50.000 + 100.000 = 150.000
    assert.equal(target.total_debt, 150000);
  });

  it('detail pelanggan → sisa_hutang, pending_debt & total_debt konsisten live', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.get(`/api/customers/${CUSTOMER_1}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.sisa_hutang, 110000);
    assert.equal(res.body.data.pending_debt, 110000);
    assert.equal(res.body.data.total_debt, 150000);
  });

  it('angka sisa hutang SAMA di semua endpoint (customers vs customer-debts stats)', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const [list, detail, stats] = await Promise.all([
      agent.get('/api/customers'),
      agent.get(`/api/customers/${CUSTOMER_1}`),
      agent.get(`/api/customer-debts/stats/${CUSTOMER_1}`),
    ]);
    assert.equal(list.status, 200);
    assert.equal(detail.status, 200);
    assert.equal(stats.status, 200);
    const fromList = list.body.data.items.find((c) => c.id === CUSTOMER_1).sisa_hutang;
    assert.equal(fromList, detail.body.data.sisa_hutang);
    assert.equal(fromList, Number(stats.body.data.pending_debt));
  });

  it('alias /api/pelanggan & /api/pos/pelanggan memakai angka yang sama persis', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const [pelanggan, pelangganHutang, posPelanggan, posHutang] = await Promise.all([
      agent.get('/api/pelanggan'),
      agent.get(`/api/pelanggan/${CUSTOMER_1}/hutang`),
      agent.get('/api/pos/pelanggan'),
      agent.get(`/api/pos/pelanggan/${CUSTOMER_1}/hutang`),
    ]);
    assert.equal(pelanggan.status, 200);
    assert.equal(pelangganHutang.status, 200);
    assert.equal(posPelanggan.status, 200);
    assert.equal(posHutang.status, 200);
    assert.equal(pelangganHutang.body.data.sisa_hutang, 110000);
    assert.equal(posHutang.body.data.sisa_hutang, 110000);
    assert.equal(pelangganHutang.body.data.is_lunas, false);
    const fromList = pelanggan.body.data.items.find((c) => c.id === CUSTOMER_1).sisa_hutang;
    assert.equal(fromList, posHutang.body.data.sisa_hutang);
  });
});