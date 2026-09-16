import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD } from './helpers/fakeSupabase.js';

const supabaseFake = createFakeSupabase();
mock.module('../src/config/supabase.js', { namedExports: { supabase: supabaseFake } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

const VALID_TX = {
  offline_id: 'offline-id-001',
  payload: {
    items: [{ product_id: '99999999-9999-9999-9999-999999999999', quantity: 1, price: 15000, discount: 0 }],
    payment_method: 'CASH',
    cash_received: 20000,
  },
};

let server;

async function loginAgent(username, password) {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return agent;
}

describe('Sync transaksi offline — POST /api/sync-offline-transactions', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    server.close();
  });

  it('tanpa login → 401', async () => {
    const res = await request(server).post('/api/sync-offline-transactions').send({ transactions: [VALID_TX] });
    assert.equal(res.status, 401);
  });

  it('validasi: tanpa transactions → 422', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/sync-offline-transactions').send({ transactions: [] });
    assert.equal(res.status, 422);
  });

  it('validasi: transaction dengan payload tidak valid → 422', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/sync-offline-transactions').send({
      transactions: [{ offline_id: 'x', payload: { items: [], payment_method: 'CASH' } }],
    });
    assert.equal(res.status, 422);
  });

  it('2 transaksi valid → 200, synced=2, hasil per offline_id', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const res = await agent.post('/api/sync-offline-transactions').send({
      transactions: [VALID_TX, { ...VALID_TX, offline_id: 'offline-id-002' }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.total, 2);
    assert.equal(res.body.data.synced, 2);
    assert.equal(res.body.data.failed, 0);
    assert.equal(res.body.data.results.length, 2);
    for (let i = 0; i < 2; i += 1) {
      assert.equal(res.body.data.results[i].success, true);
      assert.equal(res.body.data.results[i].offline_id, `offline-id-00${i + 1}`);
      assert.ok(res.body.data.results[i].invoice_number, 'hasil harus membawa invoice_number');
    }
  });

  it('offline_id dikirim ulang → idempoten (TIDAK membuat transaksi ganda)', async () => {
    const agent = await loginAgent('admin', ADMIN_PASSWORD);
    const tx = { offline_id: 'offline-id-dedup', payload: VALID_TX.payload };

    const first = await agent.post('/api/sync-offline-transactions').send({ transactions: [tx] });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.results[0].success, true);
    assert.equal(first.body.data.results[0].idempotent, false, 'kiriman pertama = buat baru');

    const second = await agent.post('/api/sync-offline-transactions').send({ transactions: [tx] });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.data.results[0].success, true, 'kiriman ulang tetap dianggap sukses');
    assert.equal(second.body.data.results[0].idempotent, true, 'kiriman ulang = transaksi lama');
    assert.equal(
      second.body.data.results[0].invoice_number,
      first.body.data.results[0].invoice_number,
      'harus mengembalikan invoice yang sama (bukan transaksi baru)'
    );

    const dedupRows = supabaseFake.store.sales.filter((s) => s.offline_id === 'offline-id-dedup');
    assert.equal(dedupRows.length, 1, 'offline_id yang sama harus menghasilkan SATU transaksi saja');
  });
});