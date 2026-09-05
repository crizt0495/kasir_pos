import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';

const products = [
  { id: 'p1', sku: 'X1', name: 'Produk Diskon', stock: 50, min_stock: 0, status: 'active', cost_price: 8000 },
];
// Item dengan diskon 2000 — price=10000, subtotal=8000 (setelah diskon)
const saleItems = [
  { id: 'si1', sale_id: 'sale-1', product_id: 'p1', quantity: 10, price: 10000, discount: 2000, subtotal: 8000, profit: 2000 },
];

const state = {
  returns: [],
  returnItems: [],
  inventoryMovements: [],
  sales: [{ id: 'sale-1', customer_id: null, payment_method: 'CASH', status: 'completed' }],
  auditLogs: [],
  returnedPerItem: {},
};

function resetState() {
  state.returns = [];
  state.returnItems = [];
  state.inventoryMovements = [];
  state.auditLogs = [];
  state.sales = [{ id: 'sale-1', customer_id: null, payment_method: 'CASH', status: 'completed' }];
  state.returnedPerItem = {};
}

const fakeSB = {
  from(table) {
    const qb = {
      _table: table,
      _filters: [],
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
          const rows = state.returns.filter((r) => qb._filters.every((f) => r[f.col] === f.val));
          resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
        } else if (table === 'return_items') {
          resolve({ data: state.returnItems, error: null });
        } else if (table === 'inventory_movements') {
          resolve({ data: state.inventoryMovements, error: null });
        } else if (table === 'audit_logs') {
          resolve({ data: state.auditLogs, error: null });
        } else if (table === 'sale_items') {
          const rows = saleItems.filter((i) => qb._filters.every((f) => i[f.col] === f.val));
          resolve({ data: rows, error: null });
        } else if (table === 'sales') {
          const rows = state.sales.filter((s) => qb._filters.every((f) => s[f.col] === f.val));
          resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
      update(patch) {
        const upd = {
          eq(col, val) {
            if (table === 'sales') state.sales.forEach((s) => { if (s[col] === val) Object.assign(s, patch); });
            return upd;
          },
        };
        return upd;
      },
    };
    return qb;
  },
  rpc(fn, args) {
    if (fn !== 'fn_refund_sale') return Promise.resolve({ data: null, error: { message: 'unknown rpc' } });

    for (const it of args.p_items) {
      const q = Number(it.quantity);
      if (q == null || q === 'NaN' || !Number.isFinite(q) || q <= 0) {
        return Promise.resolve({ data: null, error: { message: 'Qty retur tidak valid' } });
      }
      const saleItem = saleItems.find((si) => si.id === it.sale_item_id);
      if (!saleItem) return Promise.resolve({ data: null, error: { message: 'item tidak ditemukan' } });
      const remain = saleItem.quantity - (state.returnedPerItem[saleItem.id] || 0);
      if (q > remain) {
        return Promise.resolve({ data: null, error: { message: 'Qty retur melebihi jumlah yang dapat diretur' } });
      }
    }

    let totalRefund = 0;
    let totalProfitRefund = 0;
    for (const it of args.p_items) {
      const saleItem = saleItems.find((si) => si.id === it.sale_item_id);
      const unitPrice = saleItem.quantity > 0 ? saleItem.subtotal / saleItem.quantity : saleItem.price;
      const qty = Number(it.quantity);
      const refundAmt = qty * unitPrice;

      state.returnItems.push({
        id: `ri-${state.returnItems.length + 1}`,
        return_id: 'r1',
        sale_item_id: saleItem.id,
        product_id: saleItem.product_id,
        quantity: qty,
        price: Math.round(unitPrice * 100) / 100,
        refund_amount: refundAmt,
      });
      state.returnedPerItem[saleItem.id] = (state.returnedPerItem[saleItem.id] || 0) + qty;
      totalRefund += refundAmt;
      totalProfitRefund += saleItem.profit * (qty / saleItem.quantity);

      state.inventoryMovements.push({
        product_id: saleItem.product_id,
        type: 'SALE_RETURN', quantity: qty,
      });
    }
    state.returns.push({
      id: 'r1', return_number: `RET-RET-1`, sale_id: args.p_sale_id,
      total_refund: totalRefund, reason: args.p_reason,
    });
    state.auditLogs.push({ type: 'SALE_REFUNDED', module: 'sales', record_id: args.p_sale_id });

    return Promise.resolve({
      data: {
        return_id: 'r1',
        return_number: `RET-RET-1`,
        refund: totalRefund,
        profit_correction: totalProfitRefund,
        sale_status: 'partially_refunded',
      },
      error: null,
    });
  },
};

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });

const { refundSale } = await import('../src/controllers/sale.controller.js');

describe('fitur retur penjualan — refund_amount', () => {
  it('refund_amount = qty × unit_price setelah diskon (bukan price mentah)', async () => {
    resetState();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'sale-1' },
      body: {
        items: [{ sale_item_id: 'si1', quantity: 3 }],
        reason: 'Barang rusak',
        session_id: null,
      },
    };
    const reply = { status(s) { this._s = s; return this; }, json(b) { this._b = b; return this; } };
    await refundSale(req, reply);
    assert.equal(reply._s, 200);
    assert.equal(reply._b.data.refund, 2400); // 3 * 800
    assert.equal(reply._b.data.profit_correction, 600); // 2000 * 3/10
  });

  it('return_items.price menggunakan unit_price setelah diskon', () => {
    const ri = state.returnItems;
    assert.ok(ri.length >= 1, 'harus ada return_items');
    assert.equal(ri[0].price, 800);
    assert.equal(ri[0].refund_amount, 2400);
  });

  it('reject qty NaN', async () => {
    resetState();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'sale-1' },
      body: { items: [{ sale_item_id: 'si1', quantity: Number.NaN }], reason: 'tester', session_id: null },
    };
    let caught = null;
    try { await refundSale(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });

  it('reject qty Infinity', async () => {
    resetState();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'sale-1' },
      body: { items: [{ sale_item_id: 'si1', quantity: Infinity }], reason: 'tester', session_id: null },
    };
    let caught = null;
    try { await refundSale(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });

  it('reject qty > sisa', async () => {
    resetState();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'sale-1' },
      body: { items: [{ sale_item_id: 'si1', quantity: 99 }], reason: 'tester', session_id: null },
    };
    let caught = null;
    try { await refundSale(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });

  it('reject qty <= 0', async () => {
    resetState();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'sale-1' },
      body: { items: [{ sale_item_id: 'si1', quantity: 0 }], reason: 'tester', session_id: null },
    };
    let caught = null;
    try { await refundSale(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });
});
