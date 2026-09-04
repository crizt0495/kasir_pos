import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const ADMIN_PASSWORD = 'Admin2026!x';
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
  { id: 'p-customers-view', code: 'customers.view', name: 'Lihat Pelanggan', module: 'customers' },
  { id: 'p-customers-create', code: 'customers.create', name: 'Tambah Pelanggan', module: 'customers' },
  { id: 'p-customers-update', code: 'customers.update', name: 'Ubah Pelanggan', module: 'customers' },
  { id: 'p-customers-delete', code: 'customers.delete', name: 'Hapus Pelanggan', module: 'customers' },
  { id: 'p-roles-create', code: 'roles.create', name: 'Tambah Role', module: 'roles' },
  { id: 'p-roles-update', code: 'roles.update', name: 'Ubah Role', module: 'roles' },
  { id: 'p-roles-delete', code: 'roles.delete', name: 'Hapus Role', module: 'roles' },
  { id: 'p-permissions-view', code: 'permissions.view', name: 'Lihat Permission', module: 'permissions' },
  { id: 'p-users-view', code: 'users.view', name: 'Lihat User', module: 'users' },
  { id: 'p-users-create', code: 'users.create', name: 'Tambah User', module: 'users' },
  { id: 'p-users-update', code: 'users.update', name: 'Ubah User', module: 'users' },
  { id: 'p-users-delete', code: 'users.delete', name: 'Hapus User', module: 'users' },
  { id: 'p-inventory-adjust', code: 'inventory.adjust', name: 'Penyesuaian Stok', module: 'inventory' },
];

/** Kode permission per role (sumber tunggal kebenaran relasi role↔permission) */
const rolePermissionCodes = {
  [ownerRoleId]: ['dashboard.view', 'pos.access', 'sales.view', 'sales.create', 'products.view', 'products.create', 'products.delete', 'roles.view', 'roles.create', 'roles.update', 'roles.delete', 'permissions.view', 'reports.view', 'reports.export', 'inventory.view', 'inventory.adjust', 'customers.view', 'customers.create', 'customers.update', 'customers.delete', 'users.view', 'users.create', 'users.update', 'users.delete'],
  [kasirRoleId]: ['pos.access', 'products.view', 'customers.view', 'customers.create', 'customers.update'],
};

/** Role dengan role_permissions sudah "di-join" (bentuk yang dipakai loadUserAuth) */
const roleRows = [
  { id: ownerRoleId, name: 'Owner', code: 'owner', is_system: true, role_permissions: rolePermissionCodes[ownerRoleId].map((code) => ({ permission: { code } })) },
  { id: kasirRoleId, name: 'Kasir', code: 'kasir', is_system: true, role_permissions: rolePermissionCodes[kasirRoleId].map((code) => ({ permission: { code } })) },
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

const customerRows = [
  { id: 'cccc0000-0000-0000-0000-000000000001', name: 'Budi Santoso', phone: '081234567890', email: 'budi@example.com', address: 'Jl. Merdeka No.1', total_debt: 0, pending_debt: 0 },
  { id: 'cccc0000-0000-0000-0000-000000000002', name: 'Siti Aminah', phone: '089876543210', email: 'siti@example.com', address: 'Jl. Sudirman No.5', total_debt: 0, pending_debt: 0 },
];

const customerDebtRows = [
  {
    id: 'dddd0000-0000-0000-0000-000000000001',
    customer_id: 'cccc0000-0000-0000-0000-000000000001',
    amount: 50000,
    paid_amount: 0,
    remaining_amount: 50000,
    due_date: '2026-09-15',
    status: 'pending',
    notes: 'Hutang pertama',
    created_at: '2026-08-28T10:00:00Z',
    created_by: adminId,
  },
  {
    id: 'dddd0000-0000-0000-0000-000000000002',
    customer_id: 'cccc0000-0000-0000-0000-000000000001',
    amount: 100000,
    paid_amount: 40000,
    remaining_amount: 60000,
    due_date: '2026-09-10',
    status: 'partial',
    notes: 'Sisa cicilan',
    created_at: '2026-08-20T14:30:00Z',
    created_by: adminId,
  },
];

const store = {
  users: userRows,
  profiles: userRows.map((u) => ({ id: u.id, full_name: u.profiles.full_name, email: u.profiles.email, phone: null, avatar_url: null })),
  roles: roleRows,
  permissions: permissionRows,
  role_permissions: Object.entries(rolePermissionCodes).flatMap(([roleId, codes]) =>
    codes.map((code) => ({
      role_id: roleId,
      permission_id: (permissionRows.find((p) => p.code === code) || { id: 'p-' + code }).id,
      permission: { code },
    }))
  ),
  user_roles: userRows.flatMap((u) => u.user_roles.map((ur) => ({ user_id: u.id, role: ur.role }))),
  v_users: vUserRows,
  products: productRows,
  customers: customerRows,
  customer_debts: customerDebtRows,
  debt_payments: [],
  audit_logs: [],
  settings: [{ key: 'inventory', value: { allow_negative_stock: false } }, { key: 'invoice', value: { prefix: 'INV' } }],
  sales: [],
  returns: [],
  purchases: [],
  cash_sessions: [],
  cash_transactions: [],
};

function matchesFilter(row, filters) {
  return filters.every(({ op, col, val }) => {
    const value = row[col];
    if (op === 'eq') return value === val;
    if (op === 'neq') return value !== val;
    if (op === 'ilike') return String(value || '').toLowerCase().includes(String(val).replace(/%/g, '').toLowerCase());
    if (op === 'in') {
      // PostgREST: .in.(a,b) — buang kurung pembungkus bila ada
      const cleaned = String(val || '').replace(/^\(|\)$/g, '');
      const list = Array.isArray(cleaned) ? cleaned : cleaned.split(',').filter(Boolean);
      return list.includes(value);
    }
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
        if (state.table === 'v_users') {
          // View turunan: selaraskan secara live dengan users + profiles + roles
          for (const u of store.users) {
            u.roles = (u.user_roles || []).map((ur) => ur.role).filter(Boolean);
          }
          const derived = store.users.map((u) => {
            const joined = joinUsers(u);
            return {
              id: u.id,
              username: u.username,
              is_active: u.is_active,
              must_change_password: u.must_change_password,
              token_version: u.token_version,
              last_login_at: u.last_login_at,
              full_name: (joined.profiles || {}).full_name,
              email: (joined.profiles || {}).email,
              phone: (joined.profiles || {}).phone,
              avatar_url: (joined.profiles || {}).avatar_url ?? null,
              roles: joined.roles || [],
              created_at: u.created_at,
            };
          });
          return applyQuery(derived);
        }
        if (state.table === 'users') {
          const source = store.users || [];
          return applyQuery(source).map(joinUsers);
        }
        const source = store[state.table] || [];
        return applyQuery(source);
      }

      function joinUsers(row) {
        // Emulasi join relasi: embed profil & user_roles untuk tabel users
        if (!row) return row;
        const prof = store.profiles.find((p) => p.id === row.id) || row.profiles;
        const urs =
          (store.user_roles || []).filter((ur) => ur.user_id === row.id) ||
          row.user_roles;
        const roles = urs
          .map((ur) => ur.role)
          .filter(Boolean);
        return {
          ...row,
          profiles: prof ?? row.profiles ?? null,
          user_roles: urs.length ? urs : row.user_roles || [],
          roles,
        };
      }

      function applyQuery(source) {
        let rows = source.filter((r) => matchesFilter(r, state.filters));
        if (state.orFilters.length) {
          // PostgREST .or() = SALAH SATU (OR) yang cocok
          rows = rows.filter((r) => state.orFilters.some((f) => matchesFilter(r, [f])));
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
          if (state.table === 'audit_logs') {
            store.audit_logs.push(...list);
            return { error: null, select: () => ({ single: () => ({ data: list[0] || null, error: null }), maybeSingle: () => ({ data: list[0] || null, error: null }) }) };
          }
          const created = list.map((row) => {
            if (state.table === 'users') {
              const id = row.id || randomUUID();
              const user = { ...row, id, profile: row.profile ?? null };
              if (user.profiles === undefined) user.profiles = {};
              return user;
            }
            if (state.table === 'roles') {
              return { ...row, id: row.id || randomUUID(), is_system: row.is_system ?? false };
            }
            if (state.table === 'profiles') {
              // Simpan di store.profiles + embed ke baris users agar join loadUserAuth konsisten
              const prof = { avatar_url: null, ...row };
              const parent = (store.users || []).find((u) => u.id === prof.id);
              if (parent) parent.profiles = prof;
              return prof;
            }
            return { ...row };
          });
          if (!store[state.table]) store[state.table] = [];
          let pushed = created;
          if (state.table === 'user_roles') {
            // Ubah { user_id, role_id } menjadi bentuk dengan role terembed
            pushed = created.map((ur) => ({
              user_id: ur.user_id,
              role: store.roles.find((r) => r.id === ur.role_id) || store.roles.find((r) => r.code === ur.role_id) || { id: ur.role_id, code: ur.role_id },
            }));
          }
          if (state.table === 'role_permissions') {
            // Ubah { role_id, permission_id } menjadi bentuk dengan permission terembed
            pushed = created.map((rp) => ({
              role_id: rp.role_id,
              permission_id: rp.permission_id,
              permission: { code: (store.permissions.find((p) => p.id === rp.permission_id) || {}).code },
            }));
          }
          store[state.table].push(...pushed);
          return { error: null, select: () => ({ single: () => ({ data: pushed[0] || null, error: null }), maybeSingle: () => ({ data: pushed[0] || null, error: null }) }) };
        },
        update(patch) {
          const target = () => store[state.table] || (store[state.table] = []);
          const qUpdate = {
            eq(col, val) {
              const rows = target();
              rows.forEach((r) => {
                if (r[col] === val) Object.assign(r, { ...patch, updated_at: r.updated_at ?? new Date().toISOString() });
              });
              return qUpdate;
            },
            in(col, vals) {
              const rows = target();
              rows.forEach((r) => {
                if (Array.isArray(vals) && vals.includes(r[col])) Object.assign(r, { ...patch });
              });
              return qUpdate;
            },
          };
          return qUpdate;
        },
        upsert(rows) {
          const list = Array.isArray(rows) ? rows : [rows];
          list.forEach((row) => {
            const arr = store[state.table] || (store[state.table] = []);
            const idx = arr.findIndex((r) => r.id === row.id);
            if (state.table === 'profiles') {
              const parent = (store.users || []).find((u) => u.id === row.id);
              if (parent) parent.profiles = { avatar_url: null, ...parent.profiles, ...row };
            }
            if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
            else arr.push({ ...row });
          });
          return { error: null, select: () => ({ single: () => ({ data: list[0] || null, error: null }), maybeSingle: () => ({ data: list[0] || null, error: null }) }) };
        },
        delete() {
          const target = () => store[state.table] || (store[state.table] = []);
          const qDelete = {
            eq(col, val) {
              const rows = target();
              for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i][col] === val) rows.splice(i, 1);
              }
              return qDelete;
            },
            in(col, vals) {
              const rows = target();
              for (let i = rows.length - 1; i >= 0; i--) {
                if (Array.isArray(vals) && vals.includes(rows[i][col])) rows.splice(i, 1);
              }
              return qDelete;
            },
          };
          return qDelete;
        },
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
      if (fn === 'fn_record_debt') {
        const debtId = 'dddd0000-0000-0000-0000-000000000099';
        const debt = { id: debtId, customer_id: args.p_customer_id, amount: args.p_amount, paid_amount: 0, remaining_amount: args.p_amount, due_date: args.p_due_date, status: 'pending', notes: args.p_notes, created_by: args.p_created_by, created_at: new Date().toISOString() };
        if (!store.customer_debts) store.customer_debts = [];
        store.customer_debts.push(debt);
        const cust = store.customers.find((c) => c.id === args.p_customer_id);
        if (cust) { cust.total_debt = (cust.total_debt || 0) + args.p_amount; cust.pending_debt = (cust.pending_debt || 0) + args.p_amount; }
        return Promise.resolve({ data: { debt_id: debtId, amount: args.p_amount, status: 'pending' }, error: null });
      }
      if (fn === 'fn_pay_debt') {
        const debt = (store.customer_debts || []).find((d) => d.id === args.p_debt_id);
        if (!debt) return Promise.resolve({ data: null, error: { message: 'Debt not found' } });
        const newPaid = (debt.paid_amount || 0) + args.p_amount;
        const remaining = (debt.amount || 0) - newPaid;
        debt.paid_amount = newPaid;
        debt.remaining_amount = Math.max(0, remaining);
        debt.status = remaining <= 0 ? 'paid' : 'partial';
        const cust = store.customers.find((c) => c.id === debt.customer_id);
        if (cust) cust.pending_debt = Math.max(0, (cust.pending_debt || 0) - args.p_amount);
        return Promise.resolve({ data: { debt_id: args.p_debt_id, amount_paid: newPaid, remaining_amount: debt.remaining_amount, status: debt.status }, error: null });
      }
      if (fn === 'fn_get_customer_debt_stats') {
        const debts = (store.customer_debts || []).filter((d) => d.customer_id === args.p_customer_id);
        const active = debts.filter((d) => d.status !== 'cancelled');
        const totalDebt = active.reduce((s, d) => s + (d.amount || 0), 0);
        const totalPaid = active.reduce((s, d) => s + (d.paid_amount || 0), 0);
        const pendingDebt = active.reduce((s, d) => s + Math.max(0, (d.amount || 0) - (d.paid_amount || 0)), 0);
        return Promise.resolve({ data: { total_debt: totalDebt, total_paid: totalPaid, pending_debt: pendingDebt, debt_count: debts.length }, error: null });
      }
      if (fn === 'fn_get_debt_summary') {
        return Promise.resolve({
          data: {
            total_pending: 150000,
            total_paid: 40000,
            total_overdue: 0,
            total_all: 190000,
            count_pending: 1,
            count_paid: 1,
            count_overdue: 0,
            count_partial: 1,
            count_all: 2,
            customers_with_debt: 1,
            paid_today: 25000,
            new_debt_today: 50000,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: {}, error: null });
    },
  };
}

export { ADMIN_PASSWORD, LIMITED_PASSWORD };
