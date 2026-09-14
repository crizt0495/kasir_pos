import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';
process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
process.env.VAPID_PUBLIC_KEY = 'BPubKeyTest0';
process.env.VAPID_PRIVATE_KEY = 'BVPrivKeyTest0';

// ------------------------------------------------------------
// Fake Supabase yang mensimulasikan unique constraint
// (opname_id, product_id) pada stock_opname_items.
// - insert ke key yang sudah ada => error duplicate key (regresi lama)
// - upsert meng-overwrite baris lama (perbaikan baru)
// ------------------------------------------------------------
const store = {
  opnames: [
    { id: 'op-1', status: 'draft', opname_date: '2026-09-14', notes: null },
  ],
  items: [
    { id: 'i1', opname_id: 'op-1', product_id: 'prod-1', system_stock: 10, physical_stock: 9, reason: null },
    { id: 'i2', opname_id: 'op-1', product_id: 'prod-2', system_stock: 5, physical_stock: 5, reason: null },
  ],
};

const keyOf = (row) => `${row.opname_id}|${row.product_id}`;
const tableOf = (t) => (t === 'stock_opnames' ? 'opnames' : t === 'stock_opname_items' ? 'items' : t);

const fakeSB = (() => {
  const matches = (row, filters) => filters.every((f) => {
    if (f.op === 'eq') return row[f.col] === f.val;
    if (f.op === 'not' && f.op2 === 'in') return !f.val.includes(row[f.col]);
    return true;
  });

  function qb(table) {
    const q = {
      _table: table,
      _filters: [],
      _mode: null,
      _insert: null,
      _op: null,
      _insertRows: null,
      select() { return q; },
      eq(col, val) { q._filters.push({ op: 'eq', col, val }); return q; },
      not(col, op2, val) { q._filters.push({ op: 'not', op2, col, val }); return q; },
      single() { q._mode = 'single'; return q; },
      maybeSingle() { q._mode = 'maybeSingle'; return q; },
      insert(payload) { q._insert = payload; return q; },
      update(patch) {
        return {
          eq(col, val) {
            store[tableOf(table)] = store[tableOf(table)].map((row) => (row[col] === val ? { ...row, ...patch } : row));
            return Promise.resolve({ error: null });
          },
        };
      },
      delete() { q._op = 'delete'; return q; },
      upsert(rows, opts) { q._op = 'upsert'; q._insertRows = rows; q._onConflict = opts?.onConflict; return q; },
      then(resolve) {
        if (q._op === 'delete') {
          const filtered = store[tableOf(table)].filter((row) => !matches(row, q._filters));
          store[tableOf(table)] = filtered;
          resolve({ data: null, error: null });
          return;
        }
        if (q._op === 'upsert') {
          store[tableOf(table)] = store[tableOf(table)].filter((row) => !matches(row, q._filters));
          q._insertRows.forEach((row) => {
            const existing = store[tableOf(table)].find((r) => keyOf(r) === keyOf(row));
            if (existing) {
              Object.assign(existing, row);
              store[tableOf(table)] = store[tableOf(table)].filter((r) => r.id !== existing.id);
              store[tableOf(table)].push(existing);
            } else {
              store[tableOf(table)].push({ id: `n-${store[tableOf(table)].length + 1}`, ...row });
            }
          });
          resolve({ data: null, error: null });
          return;
        }
        if (q._insert !== null) {
          if (table === 'stock_opnames') {
            const row = { id: 'op-new', ...q._insert };
            store.opnames.push(row);
            resolve({ data: { id: row.id }, error: null });
            return;
          }
          if (table === 'stock_opname_items') {
            for (const row of q._insert) {
              if (store.items.some((r) => keyOf(r) === keyOf(row))) {
                resolve({
                  data: null,
                  error: { message: 'duplicate key value violates unique constraint "stock_opname_items_opname_id_product_id_key"' },
                });
                return;
              }
            }
            store.items.push(...q._insert.map((row) => ({ id: `n-${store.items.length + 1}`, ...row })));
            resolve({ data: null, error: null });
            return;
          }
          resolve({ data: null, error: null });
          return;
        }
        const rows = store[tableOf(table)].filter((r) => matches(r, q._filters));
        if (q._mode === 'maybeSingle') resolve({ data: rows[0] ?? null, error: null });
        else if (q._mode === 'single') resolve({ data: rows[0], error: null });
        else resolve({ data: rows, error: null });
      },
    };
    return q;
  }

  return {
    from(table) { return qb(table); },
    rpc() { return Promise.resolve({ data: null, error: { message: 'unknown' } }); },
  };
})();

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });
mock.module('web-push', { defaultExport: { setVapidDetails() {}, async sendNotification() {} } });

const { updateOpname, createOpname } = await import('../src/controllers/inventory.controller.js');

function makeReply() {
  const res = {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
  return res;
}

describe('stock opname — duplicate (opname_id, product_id)', () => {
  it('updateOpname dengan item yang sudah ada di DB tidak lagi error duplicate key', async () => {
    const res = makeReply();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'op-1' },
      body: {
        opname_date: '2026-09-14',
        notes: null,
        items: [
          { product_id: 'prod-1', system_stock: 10, physical_stock: 7, reason: 'rusak' },
          { product_id: 'prod-2', system_stock: 5, physical_stock: 6, reason: null },
        ],
      },
    };
    await updateOpname(req, res);
    assert.equal(res._status, 200);
    const p1 = store.items.find((i) => i.product_id === 'prod-1');
    const p2 = store.items.find((i) => i.product_id === 'prod-2');
    assert.equal(p1.physical_stock, 7);
    assert.equal(p2.physical_stock, 6);
    assert.equal(store.items.length, 2);
  });

  it('updateOpname menggabungkan produk duplikat dalam satu payload', async () => {
    const res = makeReply();
    const req = {
      user: { id: 'user-1' },
      params: { id: 'op-1' },
      body: {
        opname_date: '2026-09-14',
        notes: null,
        items: [
          { product_id: 'prod-1', system_stock: 10, physical_stock: 3, reason: null },
          { product_id: 'prod-1', system_stock: 10, physical_stock: 4, reason: 'tambahan' },
        ],
      },
    };
    await updateOpname(req, res);
    assert.equal(res._status, 200);
    const rows = store.items.filter((i) => i.product_id === 'prod-1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].physical_stock, 7);
    assert.equal(rows[0].reason, 'tambahan');
    const removed = store.items.filter((i) => i.product_id === 'prod-2');
    assert.equal(removed.length, 0);
  });

  it('createOpname menggabungkan produk duplikat sebelum insert', async () => {
    const res = makeReply();
    const req = {
      user: { id: 'user-1' },
      body: {
        opname_date: '2026-09-14',
        notes: null,
        items: [
          { product_id: 'prod-1', system_stock: 10, physical_stock: 2, reason: null },
          { product_id: 'prod-1', system_stock: 10, physical_stock: 5, reason: null },
        ],
      },
    };
    await createOpname(req, res);
    assert.equal(res._status, 201);
    const rows = store.items.filter((i) => i.opname_id === 'op-new');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].physical_stock, 7);
  });
});