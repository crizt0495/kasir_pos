import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';

const SALE = 'sale-1';
const CUSTOMER = 'cust-1';
const D1 = 'debt-1';
const D2 = 'debt-2';
const STANDALONE = 'debt-standalone';

function resetState() {
  state.debts = [
    { id: D1, customer_id: CUSTOMER, amount: 25000, paid_amount: 0, remaining_amount: 25000, status: 'pending', sale_id: SALE },
    { id: D2, customer_id: CUSTOMER, amount: 50000, paid_amount: 0, remaining_amount: 50000, status: 'cancelled', sale_id: SALE },
    { id: STANDALONE, customer_id: CUSTOMER, amount: 10000, paid_amount: 0, remaining_amount: 10000, status: 'pending', sale_id: null },
  ];
  state.auditLogs = [];
}

const state = {};
resetState();

function applyFilters(rows, filters) {
  return rows.filter((r) =>
    filters.every((f) => {
      if (f.op === 'in') return (f.vals || []).includes(r[f.col]);
      return r[f.col] === f.val;
    })
  );
}

const fakeSB = {
  from(table) {
    const qb = {
      _filters: [],
      _mode: 'multi',
      select() { return qb; },
      eq(col, val) { qb._filters.push({ op: 'eq', col, val }); return qb; },
      in(col, vals) { qb._filters.push({ op: 'in', col, vals }); return qb; },
      maybeSingle() { qb._mode = 'maybeSingle'; return qb; },
      single() { qb._mode = 'single'; return qb; },
      async then(resolve) {
        if (table === 'customer_debts') {
          const rows = applyFilters(state.debts, qb._filters);
          const data = qb._mode === 'single' || qb._mode === 'maybeSingle' ? rows[0] : rows;
          resolve({ data: data ?? null, error: null });
        } else if (table === 'audit_logs') {
          resolve({ data: null, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
      async insert(rows) {
        const list = Array.isArray(rows) ? rows : [rows];
        if (table === 'audit_logs') state.auditLogs.push(...list);
        return { error: null };
      },
    };
    return qb;
  },

  async rpc(fn, args) {
    if (fn === 'fn_cancel_debt') {
      const debt = state.debts.find((d) => d.id === args.p_debt_id);
      if (!debt) return { data: null, error: { message: 'Hutang tidak ditemukan' } };
      if (debt.status === 'cancelled') return { data: null, error: { message: 'Hutang sudah dibatalkan' } };
      if (Number(debt.paid_amount) > 0) {
        return { data: null, error: { message: 'Hutang yang sudah dibayar sebagian tidak dapat dibatalkan' } };
      }
      debt.status = 'cancelled';
      return { data: { debt_id: debt.id, status: 'cancelled' }, error: null };
    }
    return { data: null, error: { message: `rpc ${fn} tidak dikenal` } };
  },
};

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });

const { cancelPiutang } = await import('../src/services/customerDebtService.js');

const USER = { id: 'user-1', username: 'admin' };

describe('cancelPiutang — single source of truth pembatalan hutang', () => {
  it('dari transaksi: batalkan hutang aktif, hutang cancelled tidak disentuh', async () => {
    resetState();
    const result = await cancelPiutang({ saleId: SALE, reason: 'Salah input hutang', user: USER });

    assert.equal(result.status, 'DIBATALKAN');
    assert.equal(result.sale_id, SALE);
    assert.equal(result.customer_id, CUSTOMER);
    assert.equal(result.cancelled_count, 1);
    assert.equal(result.cancelled_amount, 25000);
    assert.deepEqual(result.cancelled_debt_ids, [D1]);

    assert.equal(state.debts.find((d) => d.id === D1).status, 'cancelled');
    assert.equal(state.debts.find((d) => d.id === D2).status, 'cancelled');

    const audit = state.auditLogs.find((a) => a.action === 'BATAL_HUTANG');
    assert.ok(audit, 'audit BATAL_HUTANG tercatat di level transaksi');
    assert.equal(audit.record_id, SALE);
    assert.equal(audit.new_data.cancelled_amount, 25000);
  });

  it('dari menu Hutang (debtId): resolve sale_id dan batalkan via jalur yang sama', async () => {
    resetState();
    const result = await cancelPiutang({ debtId: D1, reason: 'Pelanggan salah catat', user: USER });

    assert.equal(result.sale_id, SALE);
    assert.equal(state.debts.find((d) => d.id === D1).status, 'cancelled');
    const audit = state.auditLogs.find((a) => a.action === 'BATAL_HUTANG');
    assert.ok(audit);
    assert.equal(audit.record_id, SALE);
  });

  it('hutang tanpa transaksi (sale_id null) tetap bisa dibatalkan tanpa audit BATAL_HUTANG', async () => {
    resetState();
    const result = await cancelPiutang({ debtId: STANDALONE, reason: 'Bonus toko', user: USER });

    assert.equal(result.sale_id, null);
    assert.equal(state.debts.find((d) => d.id === STANDALONE).status, 'cancelled');
    assert.equal(state.auditLogs.find((a) => a.action === 'BATAL_HUTANG'), undefined);
  });

  it('tolak bila tidak ada hutang aktif', async () => {
    resetState();
    state.debts = state.debts.map((d) => ({ ...d, status: 'cancelled' }));
    await assert.rejects(
      () => cancelPiutang({ saleId: SALE, reason: 'Coba batal', user: USER }),
      /Tidak ada hutang aktif/
    );
  });

  it('tolak bila hutang sudah dibatalkan', async () => {
    resetState();
    await assert.rejects(
      () => cancelPiutang({ debtId: D2, reason: 'Coba lagi', user: USER }),
      /sudah dibatalkan/
    );
  });

  it('tolak alasan kosong', async () => {
    resetState();
    await assert.rejects(
      () => cancelPiutang({ saleId: SALE, reason: '   ', user: USER }),
      /Alasan pembatalan wajib diisi/
    );
  });

  it('tolak hutang yang sudah dibayar sebagian', async () => {
    resetState();
    state.debts = state.debts.map((d) => (d.id === D1 ? { ...d, paid_amount: 5000, remaining_amount: 20000 } : d));
    await assert.rejects(
      () => cancelPiutang({ saleId: SALE, reason: 'Batal sebagian', user: USER }),
      /sudah dibayar sebagian/
    );
  });
});
