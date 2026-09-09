import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, adminId, ADMIN_PASSWORD } from './helpers/fakeSupabase.js';

process.env.JWT_SECRET = 'test-secret';
process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
process.env.VAPID_PUBLIC_KEY = 'BPubKeyTest0';
process.env.VAPID_PRIVATE_KEY = 'BVPrivKeyTest0';

const fakeSB = createFakeSupabase();
const sent = [];

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });
mock.module('web-push', {
  defaultExport: {
    setVapidDetails() {},
    async sendNotification(sub, payload) {
      sent.push({ sub, payload: JSON.parse(payload) });
      return {};
    },
  },
});

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

const SALE_ID = '00000000-0000-0000-0000-000000000001';

describe('ALUR PENUH — POST /api/sales → notifikasi penjualan ke Owner', () => {
  let server;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    await fakeSB.from('notification_subscriptions').insert({
      user_id: adminId,
      endpoint: 'https://push.example.com/e2e-endpoint',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
    await fakeSB.from('settings').insert({
      key: 'notification',
      value: { enabled: true, owner_phone: '', channels: { web_push: true, sms: false, telegram: false } },
    });
    // Detail transaksi yang dikembalikan fetchSaleDetail setelah RPC sukses
    await fakeSB.from('sales').insert({
      id: SALE_ID,
      invoice_number: 'INV-20260909-000001',
      subtotal: 15000,
      discount: 0,
      tax: 0,
      additional_cost: 0,
      total: 15000,
      payment_method: 'CASH',
      status: 'completed',
      notes: null,
      created_at: '2026-09-09T07:00:00.000Z',
      cashier_id: adminId,
      customer_id: null,
    });
  });

  after(async () => {
    mock.reset();
    sent.length = 0;
    await new Promise((resolve) => server.close(resolve));
  });

  it('201 → 1 push terkirim + 1 log sent di notification_logs', async () => {
    const agent = request.agent(server);
    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
    assert.equal(login.status, 200);

    const res = await agent.post('/api/sales').send({
      items: [{ product_id: '99999999-9999-9999-9999-999999999999', quantity: 1, price: 15000, discount: 0 }],
      payment_method: 'CASH',
      cash_received: 20000,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    // invoice dari stub RPC fn_create_sale
    assert.equal(res.body.data.invoice_number, 'INV-20260815-000001');

    await new Promise((r) => setTimeout(r, 150));

    assert.equal(sent.length, 1, 'harus ada 1 push web terkirim ke owner');
    assert.equal(sent[0].sub.endpoint, 'https://push.example.com/e2e-endpoint');
    assert.ok(sent[0].payload.title.includes('Penjualan Baru'));
    assert.equal(sent[0].payload.invoice_number, 'INV-20260909-000001');
    assert.equal(sent[0].payload.url, '/pos', 'tap notifikasi harus membuka halaman POS');

    const { data: logs } = await fakeSB.from('notification_logs').select('*');
    const okLog = logs.filter((l) => l.user_id === adminId && l.payload?.sale_id === SALE_ID && l.status === 'sent');
    assert.ok(okLog.length >= 1, 'harus ada log status sent untuk owner');
  });
});