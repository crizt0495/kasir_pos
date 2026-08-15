import bcrypt from 'bcryptjs';

const ADMIN_PASSWORD = 'Admin123!';
const LIMITED_PASSWORD = 'Limited123!';

export const adminId = '11111111-1111-1111-1111-111111111111';
export const limitedId = '22222222-2222-2222-2222-222222222222';
export const ownerRoleId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const kasirRoleId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const permissionRows = [
  { id: 'p-dashboard', code: 'dashboard.view', name: 'Lihat Dashboard', module: 'dashboard' },
  { id: 'p-pos', code: 'pos.access', name: 'Akses POS', module: 'pos' },
  { id: 'p-sales-view', code: 'sales.view', name: 'Lihat Penjualan', module: 'sales' },
  { id: 'p-sales-create', code: 'sales.create', name: 'Buat Penjualan', module: 'sales' },
  { id: 'p-products-view', code: 'products.view', name: 'Lihat Produk', module: 'products' },
  { id: 'p-products-create', code: 'products.create', name: 'Tambah Produk', module: 'products' },
  { id: 'p-products-delete', code: 'products.delete', name: 'Hapus Produk', module: 'products' },
  { id: 'p-roles-view', code: 'roles.view', name: 'Lihat Role', module: 'roles' },
  { id: 'p-reports-view', code: 'reports.view', name: 'Lihat Laporan', module: 'reports' },
  { id: 'p-reports-export', code: 'reports.export', name: 'Export Laporan', module: 'reports' },
];

/** Role dengan role_permissions sudah "di-join" (bentuk yang dipakai loadUserAuth) */
const roleRows = [
  { id: ownerRoleId, name: 'Owner', code: 'owner', is_system: true, role_permissions: [{ permission: { code: 'dashboard.view' } }, { permission: { code: 'pos.access' } }, { permission: { code: 'sales.view' } }, { permission: { code: 'sales.create' } }, { permission: { code: 'products.view' } }, { permission: { code: 'products.create' } }, { permission: { code: 'products.delete' } }, { permission: { code: 'roles.view' } }, { permission: { code: 'reports.view' } }, { permission: { code: 'reports.export' } }, { permission: { code: 'inventory.view' } }, { permission: { code: 'inventory.adjust' } }] },
  { id: kasirRoleId, name: 'Kasir', code: 'kasir', is_system: true, role_permissions: [{ permission: { code: 'dashboard.view' } }, { permission: { code: 'products.view' } }] },
];

const userRows = [
  {
    id: adminId,
    username: 'admin',
    password_hash: bcrypt.hashSync(ADMIN_PASSWORD, 4),
    is_active: true,
    must_change_password: false,
    token_version: 0,
    last_login_at: null,
    profiles: { full_name: 'Administrator', email: 'admin@pos-app.local', phone: null, avatar_url: null },
    user_roles: [{ role: roleRows[0] }],
  },
  {
    id: limitedId,
    username: 'limited',
    password_hash: bcrypt.hashSync(LIMITED_PASSWORD, 4),
    is_active: true,
    must_change_password: false,
    token_version: 0,
    last_login_at: null,
    profiles: { full_name: 'User Terbatas', email: null, phone: null, avatar_url: null },
    user_roles: [{ role: roleRows[1] }],
  },
];

// v_users (view) — bentuk daftar user
const vUserRows = userRows.map((u) => ({
  id: u.id,
  username: u.username,
  is_active: u.is_active,
  must_change_password: u.must_change_password,
  token_version: u.token_version,
  last_login_at: u.last_login_at,
  full_name: u.profiles.full_name,
  email: u.profiles.email,
  phone: u.profiles.phone,
  avatar_url: null,
  roles: u.user_roles.map((ur) => ur.role),
}));

const productRows = [
  {
    id: '99999999-9999-9999-9999-999999999999',
    sku: 'BRG-0001',
    barcode: '8991001000001',
    name: 'Produk Test',
    category_id: null,
    unit_id: null,
    purchase_price: 10000,
    sale_price: 15000,
    stock: 50,
    min_stock: 5,
    status: 'active',
    description: null,
    image_url: null,
    category: null,
    unit: null,
  },
];

const store = {
  users: userRows,
  profiles: userRows.map((u) => ({ id: u.id, full_name: u.profiles.full_name, email: u.profiles.email, phone: null, avatar_url: null })),
  roles: roleRows,
  permissions: permissionRows,
  role_permissions: [],
  user_roles: userRows.flatMap((u) => u.user_roles.map((ur) => ({ user_id: u.id, role: ur.role }))),
  v_users: vUserRows,
  products: productRows,
  audit_logs: [],
  settings: [{ key: 'inventory', value: { allow_negative_stock: false } }, { key: 'invoice', value: { prefix: 'INV' } }],
};

function matchesFilter(row, filters) {
  return filters.every(({ op, col, val }) => {
    const value = row[col];
    if (op === 'eq') return value === val;
    if (op === 'neq') return value !== val;
    if (op === 'ilike') return String(value || '').toLowerCase().includes(String(val).replace(/%/g, '').toLowerCase());
    if (op === 'in') return Array.isArray(val) && val.includes(value);
    if (op === 'gte') return Number(value) >= Number(val);
    if (op === 'lte') return Number(value) <= Number(val);
    return true;
  });
}

export function createFakeSupabase() {
  return {
    from(table) {
      const state = { table, filters: [], orFilters: [], orderBy: null, ascending: true, rangeFrom: null, rangeTo: null, limit: null, mode: null };

      /** Bangun hasil query sesuai state */
      function finish() {
        const rows = getRows();
        if (state.mode === 'maybeSingle') {
          return rows.length ? { data: rows[0], error: null } : { data: null, error: null };
        }
        if (state.mode === 'single') {
          return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'Not found' } };
        }
        return { data: rows, count: rows.length, error: null };
      }

      function getRows() {
        const source = store[state.table] || [];
        let rows = source.filter((r) => matchesFilter(r, state.filters));
        if (state.orFilters.length) {
          rows = rows.filter((r) => matchesFilter(r, state.orFilters));
        }
        if (state.orderBy && rows.length) {
          rows = [...rows].sort((a, b) => {
            const av = a[state.orderBy];
            const bv = b[state.orderBy];
            if (av == null) return 1;
            if (bv == null) return -1;
            return state.ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
          });
        }
        if (state.limit) rows = rows.slice(0, state.limit);
        if (state.rangeFrom != null) rows = rows.slice(state.rangeFrom, state.rangeTo + 1);
        return rows;
      }

      // Query builder harus AWAITABLE seperti supabase-js asli (thenable)
      const q = {
        select() { return q; },
        eq(col, val) { state.filters.push({ op: 'eq', col, val }); return q; },
        neq(col, val) { state.filters.push({ op: 'neq', col, val }); return q; },
        ilike(col, val) { state.filters.push({ op: 'ilike', col, val }); return q; },
        in(col, val) { state.filters.push({ op: 'in', col, val }); return q; },
        gte(col, val) { state.filters.push({ op: 'gte', col, val }); return q; },
        lte(col, val) { state.filters.push({ op: 'lte', col, val }); return q; },
        or(str) {
          // Format supabase: "col1.op.val1,col2.op.val2" (salah satu harus cocok)
          String(str || '').split(',').forEach((part) => {
            const m = part.match(/^([a-z_.]+)\.(eq|neq|ilike|in)\.(.*)$/);
            if (m) state.orFilters.push({ op: m[2], col: m[1], val: m[3] });
          });
          return q;
        },
        order(col, { ascending } = {}) { state.orderBy = col; state.ascending = ascending !== false; return q; },
        range(from, to) { state.rangeFrom = from; state.rangeTo = to; return q; },
        limit(n) { state.limit = n; return q; },
        maybeSingle() { state.mode = 'maybeSingle'; return q; },
        single() { state.mode = 'single'; return q; },
        insert(rows) {
          const list = Array.isArray(rows) ? rows : [rows];
          if (state.table === 'audit_logs') store.audit_logs.push(...list);
          return { error: null, select: () => ({ single: () => ({ data: list[0] || null, error: null }), maybeSingle: () => ({ data: list[0] || null, error: null }) }) };
        },
        update() { return { eq: () => ({ error: null, select: () => ({ single: () => ({ data: {}, error: null }) }) }) }; },
        delete() { return { eq: () => ({ error: null }) }; },
        then(resolve) {
          resolve(finish());
        },
      };

      return q;
    },

    rpc(fn, args) {
      if (fn === 'fn_create_sale') {
        return Promise.resolve({ data: { sale_id: '00000000-0000-0000-0000-000000000001', invoice_number: 'INV-20260815-000001', subtotal: 15000, discount: 0, tax: 0, additional_cost: 0, total: 15000, payment_method: 'CASH', cash_received: 20000, change: 5000 }, error: null });
      }
      if (fn === 'fn_adjust_stock') {
        return Promise.resolve({ data: { product_id: args.p_product_id, stock: 55, delta: 5 }, error: null });
      }
      return Promise.resolve({ data: {}, error: null });
    },
  };
}

export { ADMIN_PASSWORD, LIMITED_PASSWORD };
