import { describe, it } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';

const CUSTOMER = 'cust-1';
const SALE_ITEMS = [
  { id: 'si1', sale_id: 'sale-1', product_id: 'p1', quantity: 10, price: 10000, discount: 0, subtotal: 100000, profit: 2000 },
];

function round2(n) { return Math.round(n * 100) / 100; }

const sharedState = {
  customerDebts: [],
  customers: [{ id: CUSTOMER, pending_debt: 0, total_debt: 0 }],
  sales: [{ id: 'sale-1', customer_id: CUSTOMER, payment_method: 'CASH', total: 100000, status: 'completed' }],
  returnedPerItem: {},
  returnItems: [],
  inventoryMovements: [],
  auditLogs: [],
  returns: [],
};

function resetState() {
  sharedState.customerDebts = [];
  sharedState.customers = [{ id: CUSTOMER, pending_debt: 0, total_debt: 0 }];
  sharedState.sales = [{ id: 'sale-1', customer_id: CUSTOMER, payment_method: 'CASH', total: 100000, status: 'completed' }];
  sharedState.returnedPerItem = {};
  sharedState.returnItems = [];
  sharedState.inventoryMovements = [];
  sharedState.auditLogs = [];
  sharedState.returns = [];
}

const fakeSB = {
  from(table) {
    const qb = {
      _filters: [],
      _mode: 'multi',
      select() { return qb; },
      eq(col, val) { qb._filters.push({ op: 'eq', col, val }); return qb; },
      gte() { return qb; },
      lte() { return qb; },
      in() { return qb; },
      ilike() { return qb; },
      order() { return qb; },
      range() { return qb; },
      limit() { return qb; },
      maybeSingle() { qb._mode = 'maybeSingle'; return qb; },
      single() { qb._mode = 'single'; return qb; },
      async then(resolve) {
        if (table === 'returns') {
          const rows = sharedState.returns.filter((r) => qb._filters.every((f) => r[f.col] === f.val));
          resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
        } else if (table === 'return_items') {
          resolve({ data: sharedState.returnItems, error: null });
        } else if (table === 'inventory_movements') {
          resolve({ data: sharedState.inventoryMovements, error: null });
        } else if (table === 'audit_logs') {
          resolve({ data: sharedState.auditLogs, error: null });
        } else if (table === 'sale_items') {
          const rows = SALE_ITEMS.filter((i) => qb._filters.every((f) => i[f.col] === f.val));
          resolve({ data: rows, error: null });
        } else if (table === 'sales') {
          const rows = sharedState.sales.filter((s) => qb._filters.every((f) => s[f.col] === f.val));
          resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
        } else if (table === 'customer_debts') {
          const rows = sharedState.customerDebts.filter((d) => qb._filters.every((f) => d[f.col] === f.val));
          resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
        } else if (table === 'customers') {
          const rows = sharedState.customers.filter((c) => qb._filters.every((f) => c[f.col] === f.val));
          resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
      update(patch) {
        const upd = {
          eq(col, val) {
            if (table === 'sales') sharedState.sales.forEach((s) => { if (s[col] === val) Object.assign(s, patch); });
            if (table === 'customer_debts') sharedState.customerDebts.forEach((d) => { if (d[col] === val) Object.assign(d, patch); });
            if (table === 'customers') sharedState.customers.forEach((c) => { if (c[col] === val) Object.assign(c, patch); });
            return upd;
          },
        };
        return upd;
      },
      insert(rows) {
        const ins = {
          select() { return ins; },
          single() { return ins; },
          async then(resolve) {
            const arr = Array.isArray(rows) ? rows : [rows];
            const inserted = arr.map((r, i) => ({ id: `mock-${Date.now()}-${i}`, ...r }));
            if (table === 'return_items') sharedState.returnItems.push(...inserted);
            else if (table === 'returns') sharedState.returns.push(...inserted);
            else if (table === 'audit_logs') sharedState.auditLogs.push(...inserted);
            else if (table === 'inventory_movements') sharedState.inventoryMovements.push(...inserted);
            resolve({ data: inserted, error: null });
            return ins;
          },
        };
        return ins;
      },
    };
    return qb;
  },
  rpc(fn, args) {
    if (fn === 'fn_upsert_profit_share') {
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === 'fn_adjust_debt_on_refund') {
      const debt = sharedState.customerDebts.find((d) => d.sale_id === args.p_sale_id && d.status !== 'cancelled');
      if (!debt) {
        return Promise.resolve({ data: { adjusted: false, reason: 'no_active_debt' }, error: null });
      }
      const refundRemaining = Math.min(args.p_refund_amount, Math.max(debt.remaining_amount, 0));
      const excessPaid = Math.max(args.p_refund_amount - refundRemaining, 0);
      const cappedExcess = Math.min(excessPaid, Math.max(debt.paid_amount, 0));
      const newRemaining = Math.max(round2(debt.remaining_amount - refundRemaining), 0);
      const newPaid = Math.max(round2(debt.paid_amount - cappedExcess), 0);
      const newAmount = round2(newPaid + newRemaining);
      const newStatus = newRemaining <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
      Object.assign(debt, { amount: newAmount, paid_amount: newPaid, remaining_amount: newRemaining, status: newStatus });
      const cust = sharedState.customers.find((c) => c.id === debt.customer_id);
      if (cust) {
        const pending = sharedState.customerDebts
          .filter((d) => d.customer_id === cust.id && ['pending', 'partial', 'overdue'].includes(d.status))
          .reduce((acc, d) => acc + d.remaining_amount, 0);
        const total = sharedState.customerDebts
          .filter((d) => d.customer_id === cust.id && d.status !== 'cancelled')
          .reduce((acc, d) => acc + d.amount, 0);
        cust.pending_debt = round2(pending);
        cust.total_debt = round2(total);
      }
      sharedState.auditLogs.push({ action: 'DEBT_REDUCED_BY_RETURN', module: 'customer_debts', record_id: debt.id });
      return Promise.resolve({
        data: {
          adjusted: true,
          debt_id: debt.id,
          refund_remaining: refundRemaining,
          excess_paid: cappedExcess,
          old_amount: debt.amount,
          new_amount: newAmount,
          old_remaining: debt.remaining_amount + refundRemaining,
          new_remaining: newRemaining,
          old_paid: debt.paid_amount + cappedExcess,
          new_paid: newPaid,
          new_status: newStatus,
        },
        error: null,
      });
    }
    if (fn === 'fn_refund_sale') {
      for (const it of args.p_items) {
        const q = Number(it.quantity);
        if (q == null || !Number.isFinite(q) || q <= 0) {
          return Promise.resolve({ data: null, error: { message: 'Qty retur tidak valid' } });
        }
        const saleItem = SALE_ITEMS.find((si) => si.id === it.sale_item_id);
        if (!saleItem) return Promise.resolve({ data: null, error: { message: 'item tidak ditemukan' } });
        const remain = saleItem.quantity - (sharedState.returnedPerItem[saleItem.id] || 0);
        if (q > remain) {
          return Promise.resolve({ data: null, error: { message: 'Qty retur melebihi jumlah yang dapat diretur' } });
        }
      }
      let totalRefund = 0;
      let totalProfitRefund = 0;
      for (const it of args.p_items) {
        const saleItem = SALE_ITEMS.find((si) => si.id === it.sale_item_id);
        const unitPrice = saleItem.quantity > 0 ? saleItem.subtotal / saleItem.quantity : saleItem.price;
        const qty = Number(it.quantity);
        const refundAmt = qty * unitPrice;
        sharedState.returnItems.push({ id: `ri-${sharedState.returnItems.length + 1}`, return_id: 'r1', sale_item_id: saleItem.id, quantity: qty, price: round2(unitPrice), refund_amount: round2(refundAmt) });
        sharedState.returnedPerItem[saleItem.id] = (sharedState.returnedPerItem[saleItem.id] || 0) + qty;
        totalRefund += refundAmt;
        totalProfitRefund += saleItem.profit * (qty / saleItem.quantity);
        sharedState.inventoryMovements.push({ product_id: saleItem.product_id, type: 'SALE_RETURN', quantity: qty });
      }
      const returnId = 'r1';
      sharedState.returns.push({ id: returnId, return_number: 'RET-RET-1', sale_id: args.p_sale_id, total_refund: round2(totalRefund) });
      sharedState.auditLogs.push({ action: 'SALE_REFUNDED', module: 'sales', record_id: args.p_sale_id });
      const adj = fakeSB.rpc('fn_adjust_debt_on_refund', { p_sale_id: args.p_sale_id, p_refund_amount: totalRefund, p_created_by: args.p_created_by, p_return_id: returnId });
      return adj.then((r) => ({
        data: {
          return_id: returnId, return_number: 'RET-RET-1',
          refund: round2(totalRefund), profit_correction: totalProfitRefund,
          sale_status: 'partially_refunded', debt_adjustment: r.data,
        },
        error: null,
      }));
    }
    return Promise.resolve({ data: null, error: { message: 'unknown rpc' } });
  },
};

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });

const { refundSale } = await import('../src/controllers/sale.controller.js');

describe('fitur retur penjualan — pengurangan hutang (refund_reduces_debt)', () => {
  it('retur sebagian barang: hutang dikurangi proporsional', async () => {
    resetState();
    sharedState.customerDebts.push({ id: 'd1', sale_id: 'sale-1', customer_id: CUSTOMER, amount: 100000, paid_amount: 0, remaining_amount: 100000, status: 'pending' });
    sharedState.customers[0].pending_debt = 100000;
    sharedState.customers[0].total_debt = 100000;

    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale({ user: { id: 'u1' }, params: { id: 'sale-1' }, body: { items: [{ sale_item_id: 'si1', quantity: 4 }], reason: 'Rusak', session_id: null } }, reply);

    const debt = sharedState.customerDebts[0];
    const cust = sharedState.customers[0];
    assert.equal(debt.amount, 60000, 'amount 100.000 → 60.000 (refund 40.000 dari sisa 100.000)');
    assert.equal(debt.remaining_amount, 60000);
    assert.equal(debt.status, 'pending');
    assert.equal(cust.pending_debt, 60000);
    assert.equal(cust.total_debt, 60000);
    assert.equal(reply._b.data.debt_adjustment.adjusted, true);
    assert.equal(reply._b.data.debt_adjustment.new_status, 'pending');
  });

  it('retur semua barang: hutang lunas, customer debt 0', async () => {
    resetState();
    sharedState.customerDebts.push({ id: 'd1', sale_id: 'sale-1', customer_id: CUSTOMER, amount: 100000, paid_amount: 0, remaining_amount: 100000, status: 'pending' });
    sharedState.customers[0].pending_debt = 100000;
    sharedState.customers[0].total_debt = 100000;

    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale({ user: { id: 'u1' }, params: { id: 'sale-1' }, body: { items: [{ sale_item_id: 'si1', quantity: 10 }], reason: 'Rusak', session_id: null } }, reply);

    const debt = sharedState.customerDebts[0];
    const cust = sharedState.customers[0];
    assert.equal(debt.amount, 0);
    assert.equal(debt.remaining_amount, 0);
    assert.equal(debt.status, 'paid');
    assert.equal(cust.pending_debt, 0);
    assert.equal(cust.total_debt, 0);
    assert.equal(reply._b.data.debt_adjustment.new_status, 'paid');
  });

  it('retur sebagian saat hutang sudah lunas: paid_amount & total_debt dikurangi', async () => {
    resetState();
    sharedState.customerDebts.push({ id: 'd1', sale_id: 'sale-1', customer_id: CUSTOMER, amount: 100000, paid_amount: 100000, remaining_amount: 0, status: 'paid' });
    sharedState.customers[0].pending_debt = 0;
    sharedState.customers[0].total_debt = 100000;

    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale({ user: { id: 'u1' }, params: { id: 'sale-1' }, body: { items: [{ sale_item_id: 'si1', quantity: 3 }], reason: 'Rusak', session_id: null } }, reply);

    const debt = sharedState.customerDebts[0];
    const cust = sharedState.customers[0];
    assert.equal(debt.amount, 70000);
    assert.equal(debt.paid_amount, 70000);
    assert.equal(debt.remaining_amount, 0);
    assert.equal(cust.total_debt, 70000);
    assert.equal(reply._b.data.debt_adjustment.adjusted, true);
  });

  it('retur barang tapi pelanggan tidak punya hutang: debt_adjustment.adjusted = false', async () => {
    resetState();

    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale({ user: { id: 'u1' }, params: { id: 'sale-1' }, body: { items: [{ sale_item_id: 'si1', quantity: 2 }], reason: 'Rusak', session_id: null } }, reply);

    assert.equal(reply._s, 200);
    assert.equal(reply._b.data.debt_adjustment.adjusted, false);
    assert.equal(reply._b.data.debt_adjustment.reason, 'no_active_debt');
  });

  it('retur 50% saat bayar 30% dulu: paid tetap, remaining dikurangi refund', async () => {
    resetState();
    sharedState.customerDebts.push({ id: 'd1', sale_id: 'sale-1', customer_id: CUSTOMER, amount: 100000, paid_amount: 30000, remaining_amount: 70000, status: 'partial' });
    sharedState.customers[0].pending_debt = 70000;
    sharedState.customers[0].total_debt = 100000;

    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale({ user: { id: 'u1' }, params: { id: 'sale-1' }, body: { items: [{ sale_item_id: 'si1', quantity: 5 }], reason: 'Rusak', session_id: null } }, reply);

    const debt = sharedState.customerDebts[0];
    const cust = sharedState.customers[0];
    assert.equal(debt.amount, 50000, 'amount 100.000 → 50.000 (refund 50.000)');
    assert.equal(debt.paid_amount, 30000, 'paid_amount tetap 30.000 (refund diterapkan ke remaining dulu)');
    assert.equal(debt.remaining_amount, 20000, 'remaining 70.000 → 20.000 (refund 50.000 dari remaining)');
    assert.equal(cust.pending_debt, 20000);
  });

  it('DEBT_REDUCED_BY_RETURN muncul di audit_logs', async () => {
    resetState();
    sharedState.customerDebts.push({ id: 'd1', sale_id: 'sale-1', customer_id: CUSTOMER, amount: 100000, paid_amount: 0, remaining_amount: 100000, status: 'pending' });
    sharedState.customers[0].pending_debt = 100000;

    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale({ user: { id: 'u1' }, params: { id: 'sale-1' }, body: { items: [{ sale_item_id: 'si1', quantity: 2 }], reason: 'Rusak', session_id: null } }, reply);

    const debtAudit = sharedState.auditLogs.find((a) => a.action === 'DEBT_REDUCED_BY_RETURN');
    assert.ok(debtAudit, 'audit DEBT_REDUCED_BY_RETURN harus ada');
    assert.equal(debtAudit.module, 'customer_debts');
    assert.equal(debtAudit.record_id, 'd1');
  });
});
