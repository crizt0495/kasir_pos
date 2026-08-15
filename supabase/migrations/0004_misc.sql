-- ============================================================
-- POS APP — 0004_misc.sql
-- 1. View v_users (users + profiles + roles) dengan security_barrier
--    dan policy RLS sendiri agar mudah di-search/filter.
-- 2. Fungsi transaksional tambahan: fn_adjust_stock,
--    fn_create_purchase, fn_create_expense.
-- ============================================================

-- ------------------------------------------------------------
-- V_USERS
-- ------------------------------------------------------------
create or replace view public.v_users
with (security_barrier = true) as
select
  u.id,
  u.username,
  u.is_active,
  u.must_change_password,
  u.token_version,
  u.last_login_at,
  u.created_at,
  u.updated_at,
  p.full_name,
  p.email,
  p.phone,
  p.avatar_url,
  coalesce(
    jsonb_agg(
      jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_system', r.is_system)
      order by r.name
    ) filter (where r.id is not null),
    '[]'::jsonb
  ) as roles
from public.users u
left join public.profiles p on p.id = u.id
left join public.user_roles ur on ur.user_id = u.id
left join public.roles r on r.id = ur.role_id
group by u.id, p.id;

/* RLS pada VIEW memakai security_invoker (ALTER TABLE ENABLE RLS / CREATE POLICY
tidak didukung untuk view). Dengan security_invoker, RLS tabel sumber
(users/profiles/roles — sudah aktif di 0002) ikut diberlakukan sesuai user
yang query: akses anon ditolak, service role menembus. */
alter view public.v_users set (security_invoker = true);

-- ------------------------------------------------------------
-- FN_ADJUST_STOCK (penyesuaian stok, atomic)
-- ------------------------------------------------------------
create or replace function public.fn_adjust_stock(
  p_product_id   uuid,
  p_quantity     numeric,
  p_reason       text,
  p_created_by   uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_stock       numeric;
  v_new_stock   numeric;
  v_allow_neg   boolean;
  v_name        text;
begin
  select coalesce((value ->> 'allow_negative_stock')::boolean, false)
    into v_allow_neg from public.settings where key = 'inventory';

  select stock, name into v_stock, v_name
    from public.products where id = p_product_id for update;

  if v_name is null then
    raise exception 'Produk tidak ditemukan' using errcode = 'P0001';
  end if;

  v_new_stock := v_stock + p_quantity;
  if v_new_stock < 0 and not v_allow_neg then
    raise exception 'Stok tidak boleh negatif' using errcode = 'P0001';
  end if;

  update public.products
     set stock = v_new_stock, updated_at = now(), updated_by = p_created_by
   where id = p_product_id;

  insert into public.inventory_movements
    (product_id, type, quantity, before_stock, after_stock, reference_type, notes, created_by)
  values (p_product_id, 'ADJUSTMENT', p_quantity, v_stock, v_new_stock, 'adjustment',
          coalesce(p_reason, 'Penyesuaian stok'), p_created_by);

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'STOCK_ADJUSTED', 'inventory', p_product_id,
          jsonb_build_object('product', v_name, 'delta', p_quantity, 'before', v_stock, 'after', v_new_stock, 'reason', p_reason));

  return jsonb_build_object('product_id', p_product_id, 'stock', v_new_stock, 'delta', p_quantity);
end;
$$;

-- ------------------------------------------------------------
-- FN_CREATE_PURCHASE (header + items, atomic)
-- p_items: [{"product_id": uuid, "quantity": n, "cost_price": n}]
-- ------------------------------------------------------------
create or replace function public.fn_create_purchase(
  p_supplier_id     uuid,
  p_created_by      uuid,
  p_items           jsonb,
  p_invoice_number  text default null,
  p_purchase_date   date default current_date,
  p_discount        numeric default 0,
  p_notes           text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id            uuid;
  v_number        text;
  v_counter       int;
  v_item          jsonb;
  v_subtotal      numeric := 0;
  v_total         numeric;
  v_prefix        text := 'PPR';
  v_product_id    uuid;
  v_qty           numeric;
  v_cost          numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar produk tidak boleh kosong' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('purchase_counter'));
  insert into public.purchase_counters (day, seq) values (current_date, 1)
  on conflict (day) do update set seq = public.purchase_counters.seq + 1
  returning seq into v_counter;
  v_number := v_prefix || '-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 6, '0');

  insert into public.purchases
    (purchase_number, supplier_id, invoice_number, purchase_date, status, notes, created_by, updated_by)
  values (v_number, p_supplier_id, p_invoice_number, p_purchase_date, 'draft', p_notes, p_created_by, p_created_by)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::numeric;
    v_cost       := (v_item ->> 'cost_price')::numeric;

    if v_qty <= 0 then
      raise exception 'Qty harus lebih dari 0' using errcode = 'P0001';
    end if;
    if v_cost < 0 then
      raise exception 'Harga beli tidak boleh negatif' using errcode = 'P0001';
    end if;

    insert into public.purchase_items (purchase_id, product_id, quantity, cost_price, subtotal)
    values (v_id, v_product_id, v_qty, v_cost, v_qty * v_cost);

    v_subtotal := v_subtotal + (v_qty * v_cost);
  end loop;

  v_total := v_subtotal - p_discount;

  update public.purchases set subtotal = v_subtotal, discount = p_discount, total = v_total
   where id = v_id;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'PURCHASE_CREATED', 'purchases', v_id,
          jsonb_build_object('purchase_number', v_number, 'total', v_total));

  return jsonb_build_object(
    'purchase_id', v_id,
    'purchase_number', v_number,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'total', v_total
  );
end;
$$;

-- ------------------------------------------------------------
-- FN_CREATE_EXPENSE (expense + cash transaction, atomic)
-- ------------------------------------------------------------
create or replace function public.fn_create_expense(
  p_category        text,
  p_amount          numeric,
  p_created_by      uuid,
  p_description     text default null,
  p_payment_method  text default 'CASH',
  p_expense_date    date default current_date,
  p_session_id      uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id  uuid;
begin
  if p_amount <= 0 then
    raise exception 'Nominal harus lebih dari 0' using errcode = 'P0001';
  end if;

  insert into public.expenses
    (expense_date, category, amount, description, payment_method, created_by, updated_by)
  values (p_expense_date, p_category, p_amount, p_description, p_payment_method, p_created_by, p_created_by)
  returning id into v_id;

  if p_session_id is not null then
    insert into public.cash_transactions
      (session_id, type, amount, reference_type, reference_id, notes, created_by)
    values (p_session_id, 'EXPENSE', -p_amount, 'expense', v_id, p_description, p_created_by);
  end if;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'EXPENSE_CREATED', 'expenses', v_id,
          jsonb_build_object('category', p_category, 'amount', p_amount));

  return jsonb_build_object('expense_id', v_id);
end;
$$;
