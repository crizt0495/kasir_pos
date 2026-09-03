import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission } from './permission.js';

const admin = { permissions: ['dashboard.view', 'pos.access', 'sales.view', 'sales.create', 'products.view', 'products.delete'] };
const cashier = { permissions: ['pos.access', 'sales.view', 'sales.create', 'products.view', 'customers.view'] };

describe('hasPermission', () => {
  it('true bila punya permission tunggal', () => {
    expect(hasPermission(admin, 'products.view')).toBe(true);
  });
  it('true bila punya SEMUA permission (array)', () => {
    expect(hasPermission(admin, ['dashboard.view', 'pos.access'])).toBe(true);
  });
  it('false bila tidak punya salah satu', () => {
    expect(hasPermission(admin, ['sales.view', 'roles.view'])).toBe(false);
  });
  it('kasir tidak boleh menghapus produk', () => {
    expect(hasPermission(cashier, 'products.delete')).toBe(false);
  });
  it('false bila user null', () => {
    expect(hasPermission(null, 'dashboard.view')).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('true bila punya salah satu', () => {
    expect(hasAnyPermission(cashier, ['roles.view', 'pos.access'])).toBe(true);
  });
  it('false bila tidak punya satupun', () => {
    expect(hasAnyPermission(cashier, ['roles.view', 'audit.view'])).toBe(false);
  });
});
