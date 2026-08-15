import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSaleNotification } from '../src/services/notificationService.js';

const sampleSale = {
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

describe('buildSaleNotification', () => {
  it('judul notifikasi "🔔 Penjualan Baru"', () => {
    assert.equal(buildSaleNotification(sampleSale).title, '🔔 Penjualan Baru');
  });

  it('menyertakan nama pelanggan & kasir', () => {
    const { body } = buildSaleNotification(sampleSale);
    assert.ok(body.includes('Pelanggan: Budi'));
    assert.ok(body.includes('Kasir: Andi'));
  });

  it('menyertakan daftar produk dengan qty', () => {
    const { body } = buildSaleNotification(sampleSale);
    assert.ok(body.includes('- Produk A × 2'));
    assert.ok(body.includes('- Produk B × 3'));
  });

  it('menyertakan total, metode pembayaran, dan tanggal', () => {
    const { body } = buildSaleNotification(sampleSale);
    assert.ok(body.includes('Total: Rp125.000'));
    assert.ok(body.includes('Pembayaran: CASH'));
    assert.ok(body.includes('15 Agustus 2026'));
  });

  it('payload berisi referensi transaksi', () => {
    const { payload } = buildSaleNotification(sampleSale);
    assert.equal(payload.invoice_number, 'INV-20260815-000001');
    assert.equal(payload.sale_id, sampleSale.id);
    assert.equal(payload.total, 125000);
  });

  it('pelanggan kosong → "Pelanggan Umum"', () => {
    const { body } = buildSaleNotification({ ...sampleSale, customer: null });
    assert.ok(body.includes('Pelanggan: Pelanggan Umum'));
  });
});
