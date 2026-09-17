import { describe, it, expect } from 'vitest';
import { pickSaleDebt, saleDebtView, ACTIVE_DEBT_STATUSES } from './saleDebt.js';

describe('pickSaleDebt', () => {
  it('prefer active (pending/partial/overdue) di atas cancelled & paid', () => {
    const active = { id: 'a', status: 'pending' };
    expect(pickSaleDebt([active, { id: 'c', status: 'cancelled' }])).toBe(active);
  });

  it('pilih cancelled jika tidak ada active', () => {
    const cancelled = { id: 'c', status: 'cancelled' };
    expect(pickSaleDebt([{ id: 'p', status: 'paid' }, cancelled])).toBe(cancelled);
  });

  it('pilih paid jika tidak ada active & cancelled', () => {
    const paid = { id: 'p', status: 'paid' };
    expect(pickSaleDebt([paid])).toBe(paid);
  });

  it('null jika array kosong', () => {
    expect(pickSaleDebt([])).toBeNull();
  });

  it('null jika input bukan array', () => {
    expect(pickSaleDebt(undefined)).toBeNull();
    expect(pickSaleDebt(null)).toBeNull();
  });
});

describe('saleDebtView', () => {
  it('debtor dibatalkan → kind cancelled, sisa 0', () => {
    const v = saleDebtView({ status: 'cancelled', remaining_amount: 25000 }, null, 75000);
    expect(v).toMatchObject({ kind: 'cancelled', sisa: 0, label: 'DIBATALKAN' });
  });

  it('hutang belum lunas → unpaid, sisa sesuai remaining_amount', () => {
    const v = saleDebtView({ status: 'pending', remaining_amount: 25000 }, 50000, 75000);
    expect(v).toMatchObject({ kind: 'unpaid', sisa: 25000, label: 'BELUM LUNAS' });
  });

  it('hutang partial → unpaid', () => {
    const v = saleDebtView({ status: 'partial', remaining_amount: 10000 }, 0, 20000);
    expect(v.kind).toBe('unpaid');
    expect(v.sisa).toBe(10000);
  });

  it('hutang sudah lunas → paid, sisa 0', () => {
    const v = saleDebtView({ status: 'paid', remaining_amount: 0 }, 75000, 75000);
    expect(v).toMatchObject({ kind: 'paid', sisa: 0, label: 'LUNAS' });
  });

  it('tanpa hutang, cash < total → fallback unpaid', () => {
    const v = saleDebtView(null, 50000, 75000);
    expect(v).toMatchObject({ kind: 'unpaid', sisa: 25000, label: 'BELUM LUNAS' });
  });

  it('tanpa hutang, cash >= total → paid', () => {
    expect(saleDebtView(null, 75000, 75000)).toMatchObject({ kind: 'paid', sisa: 0 });
  });

  it('tanpa hutang, cash null → paid (tampilkan tanpa kolom sisa)', () => {
    expect(saleDebtView(null, null, 75000).kind).toBe('paid');
  });
});

describe('ACTIVE_DEBT_STATUSES', () => {
  it('includes pending, partial, overdue', () => {
    expect(ACTIVE_DEBT_STATUSES.includes('pending')).toBe(true);
    expect(ACTIVE_DEBT_STATUSES.includes('partial')).toBe(true);
    expect(ACTIVE_DEBT_STATUSES.includes('overdue')).toBe(true);
    expect(ACTIVE_DEBT_STATUSES.length).toBe(3);
  });
});
