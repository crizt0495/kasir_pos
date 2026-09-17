import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';

const USER = 'user-1';
const CUSTOMER = 'cust-1';
const SALE = 'sale-1';
const PRODUCT = '00000000-0000-4000-8000-000000000001';
const PRODUCT2 = '00000000-0000-4000-8000-000000000002';

function resetState() {
  state.products = [
    { id: PRODUCT, name: 'Barang A', stock: 50, purchase_price: 5000 },
    { id: PRODUCT2, name: 'Barang B', stock: 5, purchase_price: 3000 },
  ];
  state.sales = [
    {
      id: SALE,
      invoice_number: 'INV-000001',
      customer_id: CUSTOMER,
      payment_method: 'CASH',
      status: 'completed',
      subtotal: 500000,
      discount: 0,
      tax: 0,
      additional_cost: 0,
      total: 500000,
      total_cost: 250000,
      profit: 250000,
      notes: null,
    },
  ];
  state.saleItems = [{ id: 'si1', sale_id: SALE, product_id: PRODUCT, quantity: 50, price: 10000, discount: 0, subtotal: 500000, cost_price: 5000, profit: 250000 }];
  state.salePayments = [{ id: 'pay1', sale_id: SALE, amount: 500000, payment_method: 'CASH', cash_received: 0, change_amount: 0 }];
  state.customerDebts = [{ id: 'd1', sale_id: SALE, customer_id: CUSTOMER, amount: 500000, paid_amount: 0, remaining_amount: 500000, status: 'pending' }];
  state.inventoryMovements = [];
  state.auditLogs = [];
  state.returns = [];
}

const state = {};
resetState();

function applyFilters(rows, filters) {
  return rows.filter((r) =>
    filters.every((f) => {
      if (f.op === 'in') return (f.vals || []).includes(r[f.col]);
      if (f.op === 'lt') return r[f.col] < f.val;
      return r[f.col] === f.val;
    })
  );
}

const fakeSB = {
  from(table) {
    const qb = {
      _filters: [],
      _mode: 'multi',
      _operation: null,
      _patch: null,
      select() { return qb; },
      eq(col, val) { qb._filters.push({ op: 'eq', col, val }); return qb; },
      gte() { return qb; },
      lte() { return qb; },
      ilike() { return qb; },
      in(col, vals) { qb._filters.push({ op: 'in', col, vals }); return qb; },
      lt() { return qb; },
      order() { return qb; },
      range() { return qb; },
      limit() { return qb; },
      maybeSingle() { qb._mode = 'maybeSingle'; return qb; },
      single() { qb._mode = 'single'; return qb; },
      async then(resolve) {
        if (table === 'sales') {
          let rows = applyFilters(state.sales, qb._filters);
          rows = rows.map((s) => ({
            ...s,
            items: state.saleItems.filter((i) => i.sale_id === s.id),
            payments: state.salePayments.filter((p) => p.sale_id === s.id),
          }));
          const data = qb._mode === 'single' || qb._mode === 'maybeSingle' ? rows[0] : rows;
          resolve({ data, error: null });
        } else if (table === 'returns') {
          const rows = applyFilters(state.returns, qb._filters);
          resolve({ data: qb._mode === 'single' || qb._mode === 'maybeSingle' ? rows[0] : rows, error: null });
        } else if (table === 'products') {
          const rows = applyFilters(state.products, qb._filters);
          const data = qb._mode === 'single' || qb._mode === 'maybeSingle' ? rows[0] : rows;
          resolve({ data, error: null });
        } else if (table === 'settings') {
          resolve({ data: { value: { allow_negative_stock: false } }, error: null });
        } else if (table === 'customer_debts' || table === 'sale_items' || table === 'sale_payments') {
          const src = table === 'customer_debts' ? state.customerDebts : table === 'sale_items' ? state.saleItems : state.salePayments;
          const rows = applyFilters(src, qb._filters);
          const data = qb._mode === 'single' || qb._mode === 'maybeSingle' ? rows[0] : rows;
          resolve({ data, error: null });
        } else if (table === 'inventory_movements' || table === 'audit_logs') {
          const src = table === 'inventory_movements' ? state.inventoryMovements : state.auditLogs;
          const rows = applyFilters(src, qb._filters);
          resolve({ data: rows, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
      update(patch) {
        const upd = {
          eq(col, val) {
            if (table === 'products') {
              state.products.forEach((r) => { if (r[col] === val) Object.assign(r, patch); });
            } else if (table === 'customer_debts') {
              state.customerDebts.forEach((r) => { if (r[col] === val) Object.assign(r, patch); });
            } else if (table === 'sale_payments') {
              state.salePayments.forEach((r) => { if (r[col] === val) Object.assign(r, patch); });
            } else if (table === 'sales') {
              state.sales.forEach((r) => { if (r[col] === val) Object.assign(r, patch); });
            }
            return upd;
          },
          in() { return upd; },
        };
        return upd;
      },
      delete() {
        const del = {
          eq(col, val) {
            if (table === 'sale_items') {
              state.saleItems = state.saleItems.filter((r) => r[col] !== val);
            }
            return del;
          },
        };
        return del;
      },
      async insert(rows) {
        const list = Array.isArray(rows) ? rows : [rows];
        if (table === 'sale_items') state.saleItems.push(...list);
        else if (table === 'sale_payments') state.salePayments.push(...list);
        else if (table === 'customer_debts') state.customerDebts.push(...list.map((r) => ({ ...r, id: `d-${state.customerDebts.length + 1}` })));
        else if (table === 'inventory_movements') state.inventoryMovements.push(...list);
        else if (table === 'audit_logs') state.auditLogs.push(...list.map((r) => ({ ...r, action: r.action, id: `al-${state.auditLogs.length + 1}` })));
        return { error: null };
      },
    };
    return qb;
  },

  async rpc(fn, args) {
    const _ = args; // eslint-disable-line no-unused-vars
    if (fn === 'fn_upsert_profit_share') return { data: null, error: null };
    return { data: null, error: { message: `rpc ${fn} tidak dikenal` } };
  },
};

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });

const { editSaleRecord } = await import('../src/services/saleService.js');
const { editSaleSchema } = await import('../src/validators/transaction.js');

describe('editSaleRecord — koreksi transaksi', () => {
  it('hutang 500rb → 100rb, stok balik, hutang lama dicancel, hutang baru dibuat', async () => {
    resetState();
    const result = await editSaleRecord(USER, SALE, {
      items: [{ product_id: PRODUCT, quantity: 10, price: 10000, discount: 0 }],
      reason: 'Salah jumlah',
      customer_id: CUSTOMER,
      payment_method: 'CASH',
      cash_received: 0,
      record_debt: { amount: 100000, notes: 'Koreksi jumlah' },
    });

    assert.equal(result.total, 100000);
    assert.equal(state.products[0].stock, 90); // 50 + (50-10)

    const oldDebt = state.customerDebts.find((d) => d.id === 'd1');
    assert.equal(oldDebt.status, 'cancelled');

    const newDebt = state.customerDebts.find((d) => d.id !== 'd1' && d.sale_id === SALE);
    assert.ok(newDebt, 'hutang baru dibuat');
    assert.equal(newDebt.amount, 100000);
    assert.equal(newDebt.remaining_amount, 100000);
    assert.equal(newDebt.status, 'pending');

    assert.equal(state.saleItems.length, 1);
    assert.equal(state.saleItems[0].quantity, 10);
    assert.equal(state.saleItems[0].subtotal, 100000);

    const pay = state.salePayments.find((p) => p.sale_id === SALE);
    assert.equal(pay.amount, 100000);

    assert.equal(state.sales[0].total, 100000);
    assert.equal(state.sales[0].profit, 50000); // (10000-5000)*10

    const mv = state.inventoryMovements.find((m) => m.product_id === PRODUCT);
    assert.ok(mv);
    assert.equal(mv.type, 'SALE');
    assert.equal(mv.after_stock, 90);

    const audit = state.auditLogs.find((a) => a.action === 'SALE_EDITED');
    assert.ok(audit, 'audit SALE_EDITED tercatat');
    assert.equal(audit.record_id, SALE);
    assert.equal(audit.old_data.total, 500000);
    assert.equal(audit.new_data.total, 100000);
  });

  it('bayar lunas saat koreksi → hutang lama dicancel, tidak ada hutang baru', async () => {
    resetState();
    const result = await editSaleRecord(USER, SALE, {
      items: [{ product_id: PRODUCT, quantity: 10, price: 10000, discount: 0 }],
      reason: 'Kesalahan metode bayar',
      customer_id: CUSTOMER,
      payment_method: 'CASH',
      cash_received: 100000,
    });

    assert.equal(result.debt_amount, 0);
    assert.equal(state.customerDebts.find((d) => d.id === 'd1').status, 'cancelled');
    const active = state.customerDebts.filter((d) => d.status !== 'cancelled');
    assert.equal(active.length, 0);
    assert.equal(state.salePayments[0].cash_received, 100000);
    assert.equal(state.salePayments[0].change_amount, 0);
  });

  it('tolak koreksi transaksi yang sudah diretur', async () => {
    resetState();
    state.returns = [{ id: 'r1', sale_id: SALE }];
    await assert.rejects(
      () => editSaleRecord(USER, SALE, {
        items: [{ product_id: PRODUCT, quantity: 10, price: 10000 }],
        reason: 'Tidak boleh',
      }),
      /diretur tidak dapat dikoreksi/
    );
  });

  it('tolak jika stok tidak cukup (tanpa allow_negative_stock)', async () => {
    resetState();
    await assert.rejects(
      () => editSaleRecord(USER, SALE, {
        items: [
          { product_id: PRODUCT, quantity: 10, price: 10000 },
          { product_id: PRODUCT2, quantity: 10, price: 5000 }, // stok B hanya 5
        ],
        reason: 'Ada kesalahan',
      }),
      /Stok .* tidak cukup/
    );
  });

  it('validasi schema: reason wajib min 3 karakter, items minimal 1', () => {
    assert.ok(editSaleSchema.safeParse({
      items: [{ product_id: PRODUCT, quantity: 1, price: 1000 }],
      reason: 'Salah harga',
    }).success);

    const noReason = editSaleSchema.safeParse({
      items: [{ product_id: PRODUCT, quantity: 1, price: 1000 }],
      reason: 'x',
    });
    assert.equal(noReason.success, false);

    const emptyItems = editSaleSchema.safeParse({ items: [], reason: 'Kosong' });
    assert.equal(emptyItems.success, false);
  });
});