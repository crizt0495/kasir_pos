-- ============================================================
-- POS APP — 0034_price_movements.sql
-- Pergerakan Harga: audit riwayat perubahan harga beli/jual produk.
-- ------------------------------------------------------------
-- 1. Tabel price_movements: histori harga (lama → baru, selisih,
--    sumber perubahan, user yang mengubah) — read-only untuk audit.
-- 2. Trigger di products: otomatis mencatat setiap perubahan
--    purchase_price / sale_price (hanya jika benar-benar berubah).
--    Sumber dideteksi dari session GUC 'app.price_movement_source'
--    (di-set 'pembelian' oleh RPC pembelian) → fallback 'edit_produk'.
-- 3. RLS + grants.
-- ============================================================

-- ------------------------------------------------------------
-- Tabel price_movements (idempoten)
-- ------------------------------------------------------------
create table if not exists public.price_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  price_type      text not null check (price_type in ('purchase_price', 'sale_price')),
  old_value       numeric(15,2) not null default 0,
  new_value       numeric(15,2) not null default 0,
  difference      numeric(15,2) not null default 0,
  source          text not null default 'edit_produk',
  changed_by      uuid references public.users(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Indeks
-- ------------------------------------------------------------
create index if not exists idx_price_movements_product on public.price_movements (product_id);
create index if not exists idx_price_movements_created on public.price_movements (created_at desc);
create index if not exists idx_price_movements_type on public.price_movements (price_type);

-- ------------------------------------------------------------
-- fn_append_price_movement — tambah satu catatan harga.
-- Tidak mencatat apa pun jika nilai lama == nilai baru.
-- ------------------------------------------------------------
create or replace function public.fn_append_price_movement(
  p_product_id uuid,
  p_price_type text,
  p_old_value  numeric,
  p_new_value  numeric,
  p_source     text,
  p_changed_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_old_value is not distinct from p_new_value then
    return;
  end if;
  select coalesce(username, '-') into v_name from public.users where id = p_changed_by;
  insert into public.price_movements
    (product_id, price_type, old_value, new_value, difference, source, changed_by, changed_by_name)
  values
    (p_product_id, p_price_type,
     coalesce(p_old_value, 0), coalesce(p_new_value, 0),
     coalesce(p_new_value, 0) - coalesce(p_old_value, 0),
     coalesce(p_source, 'edit_produk'), p_changed_by,
     coalesce(v_name, '-'));
end;
$$;

grant execute on function public.fn_append_price_movement(uuid, text, numeric, numeric, text, uuid) to service_role;

-- ------------------------------------------------------------
-- Trigger di products — dampak: sumber default 'edit_produk',
-- kecuali ada session GUC 'app.price_movement_source'
-- (di-set oleh RPC pembelian, scope transaksi).
-- ------------------------------------------------------------
create or replace function public.fn_log_price_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  v_source := coalesce(current_setting('app.price_movement_source', true), 'edit_produk');

  if new.purchase_price is distinct from old.purchase_price then
    perform public.fn_append_price_movement(
      new.id, 'purchase_price',
      old.purchase_price, new.purchase_price,
      v_source, new.updated_by
    );
  end if;

  if new.sale_price is distinct from old.sale_price then
    perform public.fn_append_price_movement(
      new.id, 'sale_price',
      old.sale_price, new.sale_price,
      v_source, new.updated_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_price_movement_log on public.products;
create trigger trg_price_movement_log
  after update of purchase_price, sale_price on public.products
  for each row
  execute function public.fn_log_price_movement_trigger();

-- ------------------------------------------------------------
-- RPC PEMBELIAN — tandai sumber 'pembelian' (scope transaksi)
-- supaya perubahan purchase_price dari create/update/receive
-- dicatat dengan sumber yang benar.
-- ------------------------------------------------------------

-- ---------- FN_CREATE_PURCHASE ----------
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

  perform set_config('app.price_movement_source', 'pembelian', true);

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

    -- Sinkronkan harga beli produk (abaikan jika 0/negatif agar tidak reset ke 0)
    if v_cost > 0 then
      update public.products
         set purchase_price = v_cost,
             updated_at = now(),
             updated_by = p_created_by
       where id = v_product_id;
    end if;

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

grant execute on function public.fn_create_purchase(uuid, uuid, jsonb, text, date, numeric, text) to service_role;

-- ---------- FN_UPDATE_PURCHASE ----------
create or replace function public.fn_update_purchase(
  p_purchase_id     uuid,
  p_created_by      uuid,
  p_supplier_id     uuid,
  p_invoice_number  text,
  p_purchase_date   date,
  p_discount        numeric,
  p_notes           text,
  p_items           jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_item            jsonb;
  v_product_id      uuid;
  v_qty             numeric;
  v_cost            numeric;
  v_subtotal        numeric := 0;
  v_total           numeric;
  v_purchase_status text;
  v_purchase_number text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar produk tidak boleh kosong' using errcode = 'P0001';
  end if;

  select status, purchase_number
    into v_purchase_status, v_purchase_number
    from public.purchases where id = p_purchase_id for update;
  if v_purchase_status is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase_status <> 'draft' then
    raise exception 'Hanya pembelian draft yang dapat diubah' using errcode = 'P0001';
  end if;

  update public.purchases
     set supplier_id     = p_supplier_id,
         invoice_number  = p_invoice_number,
         purchase_date   = coalesce(p_purchase_date, purchase_date),
         discount        = coalesce(p_discount, 0),
         notes           = p_notes,
         updated_by      = p_created_by
   where id = p_purchase_id;

  delete from public.purchase_items where purchase_id = p_purchase_id;

  perform set_config('app.price_movement_source', 'pembelian', true);

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
    values (p_purchase_id, v_product_id, v_qty, v_cost, v_qty * v_cost);

    -- Sinkronkan harga beli produk (abaikan jika 0/negatif)
    if v_cost > 0 then
      update public.products
         set purchase_price = v_cost,
             updated_at = now(),
             updated_by = p_created_by
       where id = v_product_id;
    end if;

    v_subtotal := v_subtotal + (v_qty * v_cost);
  end loop;

  v_total := v_subtotal - coalesce(p_discount, 0);
  update public.purchases set subtotal = v_subtotal, total = v_total where id = p_purchase_id;

  return jsonb_build_object(
    'purchase_id', p_purchase_id, 'subtotal', v_subtotal,
    'discount', coalesce(p_discount, 0), 'total', v_total
  );
end;
$$;

grant execute on function public.fn_update_purchase(uuid, uuid, uuid, text, date, numeric, text, jsonb) to service_role;

-- ---------- FN_RECEIVE_PURCHASE ----------
create or replace function public.fn_receive_purchase(
  p_purchase_id   uuid,
  p_created_by    uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_purchase  record;
  v_pi        record;
  v_stock     numeric;
  v_number    text;
  v_updated   int := 0;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase.status in ('received', 'cancelled') then
    raise exception 'Pembelian sudah diterima atau dibatalkan' using errcode = 'P0001';
  end if;

  perform set_config('app.price_movement_source', 'pembelian', true);

  for v_pi in
    select pi.* from public.purchase_items pi where pi.purchase_id = p_purchase_id for update
  loop
    select stock into v_stock from public.products where id = v_pi.product_id for update;

    update public.products
       set stock          = stock + v_pi.quantity,
           purchase_price = case
             when v_pi.cost_price > 0 then v_pi.cost_price
             else purchase_price
           end,
           updated_at     = now(),
           updated_by     = p_created_by
     where id = v_pi.product_id;
    v_updated := v_updated + 1;

    insert into public.inventory_movements
      (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
    values (v_pi.product_id, 'PURCHASE', v_pi.quantity, v_stock, v_stock + v_pi.quantity,
            p_purchase_id, 'purchase', 'Pembelian ' || v_purchase.purchase_number, p_created_by);
  end loop;

  update public.purchases
     set status = 'received', updated_at = now(), updated_by = p_created_by
   where id = p_purchase_id;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'PURCHASE_RECEIVED', 'purchases', p_purchase_id,
          jsonb_build_object(
            'purchase_number', v_purchase.purchase_number,
            'items_updated', v_updated
          ));

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'status', 'received',
    'items_updated', v_updated
  );
end;
$$;

grant execute on function public.fn_receive_purchase(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- RLS Policies — read-only untuk audit (select via backend)
-- ------------------------------------------------------------
alter table public.price_movements enable row level security;

drop policy if exists price_movements_select on public.price_movements;
create policy price_movements_select on public.price_movements
  for select using (public.has_permission('inventory.view'));

grant select on public.price_movements to service_role;