-- ============================================================
-- POS APP — 0002_rls.sql
-- Row Level Security (RLS).
--
-- Pendekatan keamanan berlapis:
--   1. Semua akses data aplikasi lewat backend (Express) yang memakai
--      SERVICE ROLE KEY — service role menembus RLS dan OTORISASI
--      dilakukan di middleware backend (requirePermission).
--   2. RLS diaktifkan di SEMUA tabel dengan policy berbasis permission.
--      Dengan begitu, akses langsung lewat anon key / Supabase client
--      publik TIDAK bisa membaca atau mengubah data apa pun.
--
-- Policy memakai helper public.has_permission(code) yang membaca
-- klaim JWT Supabase Auth (auth.jwt()->'sub'). Jika nanti auth
-- Supabase (email) dipasang, RLS langsung aktif mengikuti role.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: user id dari JWT claims
-- ------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$ language sql stable;

-- ------------------------------------------------------------
-- Helper: cek permission
-- ------------------------------------------------------------
create or replace function public.has_permission(p_code text)
returns boolean as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = public.current_user_id()
      and p.code = p_code
  );
$$ language sql stable security definer;

-- ------------------------------------------------------------
-- Helper: buat 4 policy CRUD untuk sebuah tabel
-- ------------------------------------------------------------
create or replace function public.enable_crud_policies(tbl text, mod text)
returns void as $$
begin
  execute format('create policy %I on public.%I for select using (public.has_permission(%L));',
                 tbl || '_select', tbl, mod || '.view');
  execute format('create policy %I on public.%I for insert with check (public.has_permission(%L));',
                 tbl || '_insert', tbl, mod || '.create');
  execute format('create policy %I on public.%I for update using (public.has_permission(%L));',
                 tbl || '_update', tbl, mod || '.update');
  execute format('create policy %I on public.%I for delete using (public.has_permission(%L));',
                 tbl || '_delete', tbl, mod || '.delete');
end;
$$ language plpgsql;

-- ============================================================
-- Terapkan RLS
-- ============================================================

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.product_units enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_opnames enable row level security;
alter table public.stock_opname_items enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;

-- ============================================================
-- Policies — CRUD standar per modul
-- ============================================================
select public.enable_crud_policies('users', 'users');
select public.enable_crud_policies('profiles', 'users');
select public.enable_crud_policies('roles', 'roles');
select public.enable_crud_policies('role_permissions', 'roles');
select public.enable_crud_policies('user_roles', 'users');
select public.enable_crud_policies('categories', 'categories');
select public.enable_crud_policies('product_units', 'products');
select public.enable_crud_policies('products', 'products');
select public.enable_crud_policies('stock_opnames', 'stock_opname');
select public.enable_crud_policies('stock_opname_items', 'stock_opname');
select public.enable_crud_policies('customers', 'customers');
select public.enable_crud_policies('suppliers', 'suppliers');
select public.enable_crud_policies('sales', 'sales');
select public.enable_crud_policies('sale_items', 'sales');
select public.enable_crud_policies('sale_payments', 'sales');
select public.enable_crud_policies('purchases', 'purchases');
select public.enable_crud_policies('purchase_items', 'purchases');
select public.enable_crud_policies('returns', 'returns');
select public.enable_crud_policies('return_items', 'returns');
select public.enable_crud_policies('expenses', 'expenses');

-- Inventory movements: view + create (create = inventory.create, adjust = inventory.adjust)
create policy inventory_movements_select on public.inventory_movements
  for select using (public.has_permission('inventory.view'));
create policy inventory_movements_insert on public.inventory_movements
  for insert with check (public.has_permission('inventory.create') or public.has_permission('inventory.adjust'));

-- Cash sessions: view + open + close
create policy cash_sessions_select on public.cash_sessions
  for select using (public.has_permission('cashier.view'));
create policy cash_sessions_insert on public.cash_sessions
  for insert with check (public.has_permission('cashier.open'));
create policy cash_sessions_update on public.cash_sessions
  for update using (public.has_permission('cashier.close'));

-- Cash transactions: view + create (kasir menambah IN/OUT)
create policy cash_transactions_select on public.cash_transactions
  for select using (public.has_permission('cashier.view'));
create policy cash_transactions_insert on public.cash_transactions
  for insert with check (public.has_permission('cashier.open') or public.has_permission('cashier.close'));

-- Audit log: hanya baca, hanya yang punya audit.view
create policy audit_logs_select on public.audit_logs
  for select using (public.has_permission('audit.view'));

-- Settings: view + update
create policy settings_select on public.settings
  for select using (public.has_permission('settings.view'));
create policy settings_update on public.settings
  for update using (public.has_permission('settings.update'));

-- Permissions: view only
create policy permissions_select on public.permissions
  for select using (public.has_permission('permissions.view'));

-- Counters: tidak ada policy sama sekali → deny semua akses langsung
alter table public.sale_counters enable row level security;
alter table public.return_counters enable row level security;
alter table public.purchase_counters enable row level security;
