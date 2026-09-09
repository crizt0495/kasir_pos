import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, adminId } from './helpers/fakeSupabase.js';

process.env.JWT_SECRET = 'test-secret';
process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
process.env.VAPID_PUBLIC_KEY = 'BPubKeyTest0';
process.env.VAPID_PRIVATE_KEY = 'BVPrivKeyTest0';

const fakeSB = createFakeSupabase();

const state = { calls: 0, mode: 'ok', sent: [], received: [] };

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });
mock.module('web-push', {
  defaultExport: {
    setVapidDetails() {},
    async sendNotification(sub, payload, options) {
      state.calls += 1;
      state.received.push({ sub, payload, options });
      if (state.mode === 'gone') {
        const e = new Error('Gone');
        e.statusCode = 410;
        throw e;
      }
      if (state.mode === 'denied') {
        const e = new Error('VAPID mismatch');
        e.statusCode = 403;
        throw e;
      }
      if (state.mode === 'retry-then-ok' && state.calls === 1) {
        const e = new Error('Too Many Requests');
        e.statusCode = 429;
        throw e;
      }
      state.sent.push({ sub, payload: JSON.parse(payload), options });
      return {};
    },
  },
});

const { notifyNewSale } = await import('../src/services/notificationService.js');

function makeSale(invoice, customerName = 'Budi') {
  return {
    id: randomUUID(),
    invoice_number: invoice,
    total: 100000,
    payment_method: 'CASH',
    created_at: '2026-09-10T07:00:00.000Z',
    customer: { name: customerName },
    cashier: { username: 'andi', profiles: { full_name: 'Andi' } },
    items: [{ product: { name: 'Produk X' }, quantity: 1 }],
  };
}

async function addSub(endpoint, keys = { p256dh: 'k', auth: 'a' }) {
  const id = randomUUID();
  await fakeSB.from('notification_subscriptions').insert({ id, user_id: adminId, endpoint, keys });
  return id;
}

describe('Keandalan Web Push ke HP owner', () => {
  before(async () => {
    await fakeSB.from('settings').insert({
      key: 'notification',
      value: { enabled: true, owner_phone: '', channels: { web_push: true, sms: false, telegram: false } },
    });
  });

  after(() => mock.reset());

  it('retry otomatis saat error transien (429) → push tetap sukses', async () => {
    state.mode = 'retry-then-ok';
    state.calls = 0;
    state.sent.length = 0;
    await addSub('https://push.example.com/retry');

    await notifyNewSale(makeSale('INV-1'));

    assert.equal(state.calls, 2, 'harus ada 2 attempt (1 gagal transien + 1 sukses)');
    assert.equal(state.sent.length, 1, 'push harus terkirim');
    assert.equal(state.sent[0].payload.invoice_number, 'INV-1');
  });

  it('subscription mati (410 Gone) dihapus dari DB tanpa menghentikan channel lain', async () => {
    state.mode = 'gone';
    state.calls = 0;
    const dead = await addSub('https://push.example.com/dead');

    await notifyNewSale(makeSale('INV-2'));

    const { data: subs } = await fakeSB.from('notification_subscriptions').select('*').eq('user_id', adminId);
    assert.ok(!subs.some((s) => s.id === dead), 'subscription 410 harus dihapus');
    const { data: logs } = await fakeSB.from('notification_logs').select('*');
    assert.ok(logs.some((l) => l.payload?.sale_id && l.status === 'failed'), 'harus ada log gagal (subscription mati)');
  });

  it('403 VAPID tidak cocok → subscription dihapus (harus subscribe ulang)', async () => {
    state.mode = 'denied';
    state.calls = 0;
    const bad = await addSub('https://push.example.com/vapid-mismatch');

    await notifyNewSale(makeSale('INV-3'));

    const { data: subs } = await fakeSB.from('notification_subscriptions').select('*').eq('user_id', adminId);
    assert.ok(!subs.some((s) => s.id === bad), 'subscription 403 harus dihapus');
  });

  it('body super panjang dipotong agar tidak ditolak push service', async () => {
    state.mode = 'ok';
    state.calls = 0;
    state.sent.length = 0;
    await addSub('https://push.example.com/large');

    const huge = makeSale('INV-4');
    huge.items = Array.from({ length: 10 }, (_, i) => ({
      product: { name: 'Barang Dengan Nama Sangat Panjang '.repeat(5) + `#${i}` },
      quantity: 999,
    }));
    await notifyNewSale(huge);

    const msg = state.received[state.received.length - 1].payload;
    assert.ok(msg.length <= 3000, `payload harus ≤3000 byte, dapat ${msg.length}`);
    assert.equal(state.sent.length, 1, 'push body besar tetap terkirim');
  });
});