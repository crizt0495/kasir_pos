import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';
process.env.VAPID_SUBJECT = 'mailto:admin@example.com';

// Stub VAPID keys so fn_adjust_stock doesn't error for missing keys
process.env.VAPID_PUBLIC_KEY = 'BPubKeyTest0';
process.env.VAPID_PRIVATE_KEY = 'BVPrivKeyTest0';

const fakeSB = (() => {
  // Build minimal fakeSupabase with an inventory product
  const inventory_movements = [];
  const products = [{ id: 'prod-1', sku: 'X', name: 'X', stock: 100, min_stock: 0, status: 'active' }];

  return {
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
        maybeSingle() {
          qb._mode = 'maybeSingle';
          return qb;
        },
        single() {
          qb._mode = 'single';
          return qb;
        },
        async then(resolve) {
          if (table === 'products') {
            const rows = products.filter((p) => qb._filters.every((f) => p[f.col] === f.val));
            resolve({ data: qb._mode === 'single' ? rows[0] : rows, error: null });
          } else if (table === 'inventory_movements') {
            resolve({ data: inventory_movements, error: null });
          } else if (table === 'audit_logs') {
            resolve({ data: [], error: null });
          } else if (table === 'settings') {
            resolve({ data: [{ key: 'inventory', value: { allow_negative_stock: false } }], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
        update(patch) {
          const upd = {
            eq(col, val) {
              if (table === 'products') {
                products.forEach((p) => { if (p[col] === val) Object.assign(p, patch); });
              }
              return upd;
            },
          };
          return upd;
        },
      };
      return qb;
    },
    rpc(fn, args) {
      if (fn !== 'fn_adjust_stock') return Promise.resolve({ data: null, error: { message: 'unknown' } });
      // Mirror the SQL hardening (must match migration 0019)
      const q = args.p_quantity;
      const invalid =
        q == null || q === 0 || Number.isNaN(Number(q)) || !Number.isFinite(Number(q));
      if (invalid) return Promise.resolve({ data: null, error: { message: 'Jumlah penyesuaian stok tidak valid' } });

      const product = products.find((p) => p.id === args.p_product_id);
      if (!product) return Promise.resolve({ data: null, error: { message: 'Produk tidak ditemukan' } });
      const newStock = product.stock + Number(q);
      if (newStock < 0) return Promise.resolve({ data: null, error: { message: 'Stok tidak boleh negatif' } });

      product.stock = newStock;
      inventory_movements.push({
        product_id: product.id, type: 'ADJUSTMENT', quantity: q,
        before_stock: product.stock - q, after_stock: product.stock,
      });
      return Promise.resolve({ data: { product_id: product.id, stock: newStock, delta: q }, error: null });
    },
  };
})();

mock.module('../src/config/supabase.js', { namedExports: { supabase: fakeSB } });
mock.module('web-push', { defaultExport: { setVapidDetails() {}, async sendNotification() {} } });

const { adjustStock } = await import('../src/controllers/inventory.controller.js');

describe('fitur stok — adjustStock', () => {
  it('reject quantity = 0', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { product_id: 'prod-1', quantity: 0, reason: 'tester' },
    };
    const reply = (status, body) => ({ status, body });
    let caught = null;
    try {
      await adjustStock(req, reply);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
    assert.ok(/tidak valid/i.test(caught.message));
  });

  it('reject quantity NaN', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { product_id: 'prod-1', quantity: Number.NaN, reason: 'tester' },
    };
    let caught = null;
    try { await adjustStock(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });

  it('reject quantity Infinity', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { product_id: 'prod-1', quantity: Infinity, reason: 'tester' },
    };
    let caught = null;
    try { await adjustStock(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });

  it('reject negative resulting stock', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { product_id: 'prod-1', quantity: -1000, reason: 'tester' },
    };
    let caught = null;
    try { await adjustStock(req, () => {}); } catch (err) { caught = err; }
    assert.ok(caught, 'should throw');
    assert.equal(caught.status, 400);
  });

  it('terima quantity positif valid dan tulis movement', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { product_id: 'prod-1', quantity: 10, reason: 'restock' },
    };
    let response = null;
    const reply = { status(s) { response = { status: s }; return this; }, json(b) { response.body = b; return this; } };
    await adjustStock(req, reply);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.stock, 110);
    assert.equal(response.body.data.delta, 10);
  });

  it('terima quantity negatif yang tidak lewat batas', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { product_id: 'prod-1', quantity: -5, reason: 'rusak' },
    };
    let response = null;
    const reply = { status(s) { response = { status: s }; return this; }, json(b) { response.body = b; return this; } };
    await adjustStock(req, reply);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.stock, 105);
    assert.equal(response.body.data.delta, -5);
  });
});