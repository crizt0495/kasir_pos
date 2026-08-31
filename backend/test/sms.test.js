import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvider, providers } from '../src/services/smsProviders.js';
import { sendSMS, buildSaleNotification } from '../src/services/notificationService.js';

const saved = { ...process.env };

beforeEach(() => {
  process.env = { ...saved };
  delete process.env.SMS_PROVIDER;
  delete process.env.SMS_ACCOUNT_SID;
  delete process.env.SMS_AUTH_TOKEN;
  delete process.env.SMS_FROM;
  delete process.env.SMS_API_TOKEN;
  delete process.env.SMS_TO;
});

afterEach(() => {
  process.env = { ...saved };
});

describe('resolveProvider (deteksi provider SMS)', () => {
  it('auto-detect Fonnte jika SMS_API_TOKEN + SMS_TO ada', () => {
    process.env.SMS_API_TOKEN = 'tok';
    process.env.SMS_TO = '628123';
    const p = resolveProvider(process.env);
    assert.equal(p?.name, 'Fonnte');
  });

  it('auto-detect Twilio jika account SID + token + from + to ada', () => {
    process.env.SMS_ACCOUNT_SID = 'sid';
    process.env.SMS_AUTH_TOKEN = 'tok';
    process.env.SMS_FROM = '+1555';
    process.env.SMS_TO = '+62812';
    const p = resolveProvider(process.env);
    assert.equal(p?.name, 'Twilio');
  });

  it('SMS_PROVIDER eksplisit menang atas auto-detect', () => {
    process.env.SMS_PROVIDER = 'twilio';
    process.env.SMS_API_TOKEN = 'tok'; // milik Fonnte
    process.env.SMS_TO = '62812';
    process.env.SMS_ACCOUNT_SID = 'sid';
    process.env.SMS_AUTH_TOKEN = 'tok';
    process.env.SMS_FROM = '+1555';
    const p = resolveProvider(process.env);
    assert.equal(p?.name, 'Twilio');
  });

  it('return null jika tidak ada provider terkonfigurasi', () => {
    const p = resolveProvider(process.env);
    assert.equal(p, null);
  });
});

describe('sendSMS', () => {
  it('return pesan "tidak dikonfigurasi" jika tidak ada provider (memakai modul live)', async () => {
    const err = await sendSMS('test');
    assert.match(err, /tidak dikonfigurasi/);
  });
});

describe('buildSaleNotification untuk SMS', () => {
  it('total & invoice tersedia', () => {
    const sale = {
      invoice_number: 'INV-20260815-000001',
      total: 125000,
      payment_method: 'CASH',
      created_at: '2026-08-15T07:30:00.000Z',
      customer: { name: 'Budi' },
      items: [],
    };
    const n = buildSaleNotification(sale);
    assert.equal(n.title, '🔔 Penjualan Baru');
    assert.ok(n.body.includes('Rp125.000'));
  });
});
