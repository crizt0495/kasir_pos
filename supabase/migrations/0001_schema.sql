-- ============================================================
-- POS APP — 0001_schema.sql
-- Struktur database lengkap: users/auth, RBAC, master data,
-- inventory, transaksi, kas, audit, settings.
-- Semua ID memakai UUID. Semua tabel punya created_at/updated_at.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- Helper: trigger updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- AUTH & USERS
-- ------------------------------------------------------------
create table public.users (
  id                  uuid primary key default gen_random_uuid(),
  username            text not null unique,
  password_hash       text not null,
  is_active           boolean not null default true,
  must_change_password boolean not null default false,
  token_version       integer not null default 0,
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create table public.profiles (
  id                  uuid primary key references public.users(id) on delete cascade,
  full_name           text not null default '',
  email               text unique,
  phone               text,
  avatar_url          text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RBAC
-- ------------------------------------------------------------
create table public.roles (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  code                text not null unique,
  description         text,
  is_system           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create table public.permissions (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  module              text not null,
  description         text,
  created_at          timestamptz not null default now()
);

create table public.role_permissions (
  role_id             uuid not null references public.roles(id) on delete cascade,
  permission_id       uuid not null references public.permissions(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id             uuid not null references public.users(id) on delete cascade,
  role_id             uuid not null references public.roles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ------------------------------------------------------------
-- MASTER DATA
-- ------------------------------------------------------------
create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  description         text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create table public.product_units (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  short_name          text not null
);

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null unique,
  barcode             text unique,
  name                text not null,
  category_id         uuid references public.categories(id) on delete set null,
  unit_id             uuid references public.product_units(id) on delete set null,
  purchase_price      numeric(15,2) not null default 0 check (purchase_price >= 0),
  sale_price          numeric(15,2) not null default 0 check (sale_price >= 0),
  stock               numeric(15,3) not null default 0,
  min_stock           numeric(15,3) not null default 0 check (min_stock >= 0),
  status              text not null default 'active' check (status in ('active', 'inactive')),
  description         text,
  image_url           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create index idx_products_name_trgm on public.products using gin (name gin_trgm_ops);
create index idx_products_barcode on public.products (barcode);
create index idx_products_category on public.products (category_id);
create index idx_products_status on public.products (status);

-- ------------------------------------------------------------
-- INVENTORY
-- ------------------------------------------------------------
create table public.inventory_movements (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  type                text not null check (type in ('STOCK_IN', 'STOCK_OUT', 'SALE', 'SALE_RETURN', 'PURCHASE', 'ADJUSTMENT', 'STOCK_OPNAME')),
  quantity            numeric(15,3) not null,
  before_stock        numeric(15,3),
  after_stock         numeric(15,3),
  reference_id        uuid,
  reference_type      text,
  notes               text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now()
);

create index idx_movements_product on public.inventory_movements (product_id, created_at desc);
create index idx_movements_type on public.inventory_movements (type);
create index idx_movements_created on public.inventory_movements (created_at desc);

create table public.stock_opnames (
  id                  uuid primary key default gen_random_uuid(),
  opname_date         date not null default current_date,
  status              text not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),
  notes               text,
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.stock_opname_items (
  id                  uuid primary key default gen_random_uuid(),
  opname_id           uuid not null references public.stock_opnames(id) on delete cascade,
  product_id          uuid not null references public.products(id) on delete cascade,
  system_stock        numeric(15,3) not null default 0,
  physical_stock      numeric(15,3) not null default 0,
  difference          numeric(15,3) generated always as (physical_stock - system_stock) stored,
  reason              text,
  created_at          timestamptz not null default now(),
  unique (opname_id, product_id)
);

-- ------------------------------------------------------------
-- CUSTOMER & SUPPLIER
-- ------------------------------------------------------------
create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text,
  email               text,
  address             text,
  birth_date          date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create index idx_customers_name on public.customers (name);
create index idx_customers_phone on public.customers (phone);

create table public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  contact_person      text,
  phone               text,
  email               text,
  address             text,
  notes               text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create index idx_suppliers_name on public.suppliers (name);

-- ------------------------------------------------------------
-- SALES
-- ------------------------------------------------------------
create table public.sales (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      text not null unique,
  customer_id         uuid references public.customers(id) on delete set null,
  cashier_id          uuid references public.users(id) on delete set null,
  subtotal            numeric(15,2) not null default 0,
  discount            numeric(15,2) not null default 0,
  tax                 numeric(15,2) not null default 0,
  additional_cost     numeric(15,2) not null default 0,
  total               numeric(15,2) not null default 0,
  payment_method      text not null default 'CASH',
  status              text not null default 'completed' check (status in ('completed', 'partially_refunded', 'refunded', 'cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create index idx_sales_invoice on public.sales (invoice_number);
create index idx_sales_created on public.sales (created_at desc);
create index idx_sales_cashier on public.sales (cashier_id);
create index idx_sales_payment on public.sales (payment_method);
create index idx_sales_customer on public.sales (customer_id);
create index idx_sales_status on public.sales (status);

create table public.sale_items (
  id                  uuid primary key default gen_random_uuid(),
  sale_id             uuid not null references public.sales(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  quantity            numeric(15,3) not null check (quantity > 0),
  price               numeric(15,2) not null,
  discount            numeric(15,2) not null default 0,
  subtotal            numeric(15,2) not null,
  created_at          timestamptz not null default now()
);

create index idx_sale_items_sale on public.sale_items (sale_id);
create index idx_sale_items_product on public.sale_items (product_id);

create table public.sale_payments (
  id                  uuid primary key default gen_random_uuid(),
  sale_id             uuid not null references public.sales(id) on delete cascade,
  amount              numeric(15,2) not null,
  payment_method      text not null,
  cash_received       numeric(15,2),
  change_amount       numeric(15,2) not null default 0,
  created_at          timestamptz not null default now()
);

create index idx_sale_payments_sale on public.sale_payments (sale_id);

-- ------------------------------------------------------------
-- PURCHASES
-- ------------------------------------------------------------
create table public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  purchase_number     text not null unique,
  supplier_id         uuid references public.suppliers(id) on delete set null,
  invoice_number      text,
  purchase_date       date not null default current_date,
  subtotal            numeric(15,2) not null default 0,
  discount            numeric(15,2) not null default 0,
  total               numeric(15,2) not null default 0,
  payment_status      text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  status              text not null default 'draft' check (status in ('draft', 'received', 'partial', 'cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id)
);

create index idx_purchases_number on public.purchases (purchase_number);
create index idx_purchases_supplier on public.purchases (supplier_id);
create index idx_purchases_date on public.purchases (purchase_date desc);
create index idx_purchases_status on public.purchases (status);

create table public.purchase_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_id         uuid not null references public.purchases(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  quantity            numeric(15,3) not null check (quantity > 0),
  cost_price          numeric(15,2) not null,
  subtotal            numeric(15,2) not null,
  created_at          timestamptz not null default now()
);

create index idx_purchase_items_purchase on public.purchase_items (purchase_id);

-- ------------------------------------------------------------
-- RETURNS
-- ------------------------------------------------------------
create table public.returns (
  id                  uuid primary key default gen_random_uuid(),
  return_number       text not null unique,
  sale_id             uuid not null references public.sales(id) on delete cascade,
  customer_id         uuid references public.customers(id) on delete set null,
  total_refund        numeric(15,2) not null default 0,
  reason              text,
  status              text not null default 'completed',
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now()
);

create index idx_returns_sale on public.returns (sale_id);
create index idx_returns_created on public.returns (created_at desc);

create table public.return_items (
  id                  uuid primary key default gen_random_uuid(),
  return_id           uuid not null references public.returns(id) on delete cascade,
  sale_item_id        uuid references public.sale_items(id) on delete set null,
  product_id          uuid references public.products(id) on delete set null,
  quantity            numeric(15,3) not null check (quantity > 0),
  price               numeric(15,2) not null,
  refund_amount       numeric(15,2) not null,
  created_at          timestamptz not null default now()
);

create index idx_return_items_return on public.return_items (return_id);

-- ------------------------------------------------------------
-- CASH MANAGEMENT
-- ------------------------------------------------------------
create table public.cash_sessions (
  id                  uuid primary key default gen_random_uuid(),
  opened_by           uuid references public.users(id) on delete set null,
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,
  opening_balance     numeric(15,2) not null default 0,
  expected_cash       numeric(15,2),
  actual_cash         numeric(15,2),
  difference          numeric(15,2),
  close_note          text,
  status              text not null default 'open' check (status in ('open', 'closed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_cash_sessions_status on public.cash_sessions (status, opened_at desc);
create index idx_cash_sessions_opened_by on public.cash_sessions (opened_by);

create table public.cash_transactions (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references public.cash_sessions(id) on delete set null,
  type                text not null check (type in ('SALE', 'EXPENSE', 'IN', 'OUT', 'REFUND')),
  amount              numeric(15,2) not null,
  reference_type      text,
  reference_id        uuid,
  notes               text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now()
);

create index idx_cash_tx_session on public.cash_transactions (session_id);
create index idx_cash_tx_created on public.cash_transactions (created_at desc);

-- ------------------------------------------------------------
-- EXPENSES
-- ------------------------------------------------------------
create table public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  expense_date        date not null default current_date,
  category            text not null,
  amount              numeric(15,2) not null check (amount > 0),
  description         text,
  payment_method      text not null default 'CASH',
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_expenses_date on public.expenses (expense_date desc);

-- ------------------------------------------------------------
-- AUDIT LOG & SETTINGS
-- ------------------------------------------------------------
create table public.audit_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users(id) on delete set null,
  username            text,
  action              text not null,
  module              text not null,
  record_id           uuid,
  ip_address          text,
  user_agent          text,
  old_data            jsonb,
  new_data            jsonb,
  created_at          timestamptz not null default now()
);

create index idx_audit_module on public.audit_logs (module, created_at desc);
create index idx_audit_user on public.audit_logs (user_id, created_at desc);
create index idx_audit_created on public.audit_logs (created_at desc);

create table public.settings (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique,
  value               jsonb not null default '{}'::jsonb,
  updated_by          uuid references public.users(id),
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- COUNTERS (nomor transaksi anti race-condition)
-- ------------------------------------------------------------
create table public.sale_counters (
  day                 date primary key,
  seq                 integer not null default 1
);

create table public.return_counters (
  day                 date primary key,
  seq                 integer not null default 1
);

create table public.purchase_counters (
  day                 date primary key,
  seq                 integer not null default 1
);

-- trigger updated_at untuk semua tabel yang memilikinya
create trigger trg_users_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger trg_roles_updated_at before update on public.roles
for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger trg_stock_opnames_updated_at before update on public.stock_opnames
for each row execute function public.set_updated_at();
create trigger trg_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();
create trigger trg_suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create trigger trg_sales_updated_at before update on public.sales
for each row execute function public.set_updated_at();
create trigger trg_purchases_updated_at before update on public.purchases
for each row execute function public.set_updated_at();
create trigger trg_cash_sessions_updated_at before update on public.cash_sessions
for each row execute function public.set_updated_at();
create trigger trg_expenses_updated_at before update on public.expenses
for each row execute function public.set_updated_at();
