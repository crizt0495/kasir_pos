import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, adminId, limitedId } from './helpers/fakeSupabase.js';

process.env.JWT_SECRET = 'test-secret';
process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
process.env.VAPID_PUBLIC_KEY = 'BPubKeyTest0';
process.env.VAPID_PRIVATE_KEY = 'BVPrivKeyTest0';

const fakeSB = createFakeSupabase();

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });
mock.module('web-push', {
  defaultExport: {
    setVapidDetails() {},
    async sendNotification() {
      return {};
    },
  },
});

const { notifyNewSale, findOwnerUsers, sendTestNotification } = await import(
  '../src/services/notificationService.js'
);

const sale = {
  id: '00000000-0000-0000-0000-000000000002',
  invoice_number: 'INV-20260909-000001',
  total: 75000,
  payment_method: 'CASH',
  created_at: '2026-09-09T07:30:00.000Z',
  customer: { name: 'Siti' },
  cashier: { username: 'andi', profiles: { full_name: 'Andi' } },
  items: [{ product: { name: 'Produk C' }, quantity: 1 }],
};

describe('notifyNewSale — lookup owner & fallback bell', () => {
  before(async () => {
    // Aktifkan notifikasi Web Push (tanpa subscription apa pun)
    await fakeSB.from('settings').insert({
      key: 'notification',
      value: {
        enabled: true,
        owner_phone: '',
        channels: { web_push: true, sms: false, telegram: false },
      },
    });
  });

  after(() => {
    mock.reset();
  });

  it('findOwnerUsers menemukan admin (Owner) — bukan kasir', async () => {
    const owners = await findOwnerUsers();
    assert.ok(owners.includes(adminId), `admin harus terdaftar, dapat: ${owners.join(', ') || '(kosong)'}`);
    assert.ok(!owners.includes(limitedId), 'kasir tanpa permissions.view tidak boleh menerima');
  });

  it('entri bell tetap tercatat saat owner BELUM subscribe push (push_sent=false)', async () => {
    await notifyNewSale(sale);

    const { data: logs } = await fakeSB.from('notification_logs').select('*');
    const bell = logs.filter((l) => l.user_id === adminId && l.payload?.sale_id === sale.id);
    assert.ok(bell.length >= 1, 'harus ada entri bell untuk owner');
    assert.equal(bell[0].status, 'sent');
    assert.equal(bell[0].payload.push_sent, false);
  });

  it('sendTestNotification melaporkan tidak ada subscription push tanpa error', async () => {
    const owners = await findOwnerUsers();
    const results = await sendTestNotification(owners);
    assert.ok(Object.prototype.hasOwnProperty.call(results, 'web_push'));
    assert.equal(results.web_push.sent, 0);
    assert.equal(results.web_push.failed, 0);
  });
});