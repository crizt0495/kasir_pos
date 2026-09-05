import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, adminId } from './helpers/fakeSupabase.js';

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

const { notifyNewSale } = await import('../src/services/notificationService.js');

const sale = {
  id: '00000000-0000-0000-0000-000000000001',
  invoice_number: 'INV-20260815-000001',
  total: 125000,
  payment_method: 'CASH',
  created_at: '2026-08-15T07:30:00.000Z',
  customer: { name: 'Budi' },
  cashier: { username: 'andi', profiles: { full_name: 'Andi' } },
  items: [
    { product: { name: 'Produk A' }, quantity: 2 },
    { product: { name: 'Produk B' }, quantity: 3 },
  ],
};

const subscription = {
  user_id: adminId,
  endpoint: 'https://push.example.com/endpoint-abcd',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

describe('notifyNewSale — Web Push App', () => {
  before(async () => {
    await fakeSB.from('notification_subscriptions').insert(subscription);
    await fakeSB.from('settings').insert({
      key: 'notification',
      value: {
        enabled: true,
        owner_phone: '081234567890',
        channels: { web_push: true, sms: false, telegram: false },
      },
    });
  });

  after(() => {
    mock.reset();
    sent.length = 0;
  });

  it('mengirim Web Push ke HP owner saat penjualan baru', async () => {
    sent.length = 0;
    await notifyNewSale(sale);

    assert.equal(sent.length, 1, 'harus ada 1 push terkirim');
    const call = sent[0];
    assert.equal(call.sub.endpoint, subscription.endpoint);
    assert.equal(call.sub.keys.p256dh, subscription.keys.p256dh);
    assert.ok(call.payload.title.includes('Penjualan Baru'));
    assert.equal(call.payload.body.includes('Pelanggan: Budi'), true);
    assert.ok(call.payload.body.includes('Total: Rp125.000'));
    assert.equal(call.payload.invoice_number, sale.invoice_number);
    assert.equal(call.payload.sale_id, sale.id);
  });

  it('mencatat log status sent di notification_logs', async () => {
    const { data: logs } = await fakeSB.from('notification_logs').select('*');
    const saleLogs = logs.filter((l) => l.payload?.sale_id === sale.id && l.status === 'sent');
    assert.ok(saleLogs.length >= 1, 'harus ada log status sent');
    assert.equal(saleLogs[0].type, 'SALE');
    assert.equal(saleLogs[0].user_id, adminId);
  });
});
