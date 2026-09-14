-- ============================================================
-- POS APP — 0034_0035_combined.sql (GENERATED)
-- Gabungan 0034_price_movements.sql + 0035_status_barang_revisi_harga.sql.
-- DIBUAT OTOMATIS dari dua file migrasi asli — untuk disalin-paste
-- langsung ke Supabase SQL editor (cukup SEKALI tempel, urut otomatis).
-- Jika 0034/0035 diubah, pisahkan urunannya dengan menjalankan:
--   cat supabase/migrations/0034_price_movements.sql supabase/migrations/0035_status_barang_revisi_harga.sql > supabase/migrations/0034_0035_combined.sql
-- Idempoten: aman dijalankan berulang.
-- ============================================================

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

-- ============================================================
-- POS APP — 0035_status_barang_revisi_harga.sql
-- Revisi logika pergerakan harga beli.
-- ------------------------------------------------------------
-- Aturan baru (menggantikan perilaku 0034 yang sinkron saat draft):
--   1. purchases.status_barang: DRAFT / BARANG_DITERIMA / BATAL.
--   2. Harga beli produk HANYA berubah saat pembelian berstatus
--      BARANG_DITERIMA **dan** payment_status = LUNAS ('paid').
--   3. Draft dibuat/diubah TIDAK menulis ke products.purchase_price.
--   4. Menghapus pembelian BARANG_DITERIMA me-revert harga beli
--      produk ke harga semula (catatan purchase-origin dihapus).
--   5. Mendeklarasikan LUNAS pada pembelian BARANG_DITERIMA yang
--      belum lunas akan menjalankan sinkronisasi harga sekaligus.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kolom status_barang di purchases (idempoten + backfill)
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases'
      and column_name = 'status_barang'
  ) then
    alter table public.purchases
      add column status_barang text not null default 'DRAFT'
      check (status_barang in ('DRAFT', 'BARANG_DITERIMA', 'BATAL'));

    update public.purchases set status_barang = 'BARANG_DITERIMA' where status = 'received';
    update public.purchases set status_barang = 'BATAL' where status = 'cancelled';
  end if;
end;
$$;

create index if not exists idx_purchases_status_barang on public.purchases (status_barang);

-- ------------------------------------------------------------
-- 2. Kolom id_referensi di price_movements (idempoten)
--    Menautkan catatan harga ke purchase yang memicunya sehingga
--    penghapusan pembelian dapat me-revert harga per pembelian.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_movements'
      and column_name = 'id_referensi'
  ) then
    alter table public.price_movements
      add column id_referensi uuid;
  end if;
end;
$$;

create index if not exists idx_price_movements_ref on public.price_movements (id_referensi);

-- ------------------------------------------------------------
-- 3. fn_append_price_movement — overload dengan id_referensi
--    (varian 7-arg; varian 6-arg lama tetap berfungsi).
-- ------------------------------------------------------------
create or replace function public.fn_append_price_movement(
  p_product_id uuid,
  p_price_type text,
  p_old_value  numeric,
  p_new_value  numeric,
  p_source     text,
  p_changed_by uuid,
  p_id_referensi uuid default null
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
    (product_id, price_type, old_value, new_value, difference, source, changed_by, changed_by_name, id_referensi)
  values
    (p_product_id, p_price_type,
     coalesce(p_old_value, 0), coalesce(p_new_value, 0),
     coalesce(p_new_value, 0) - coalesce(p_old_value, 0),
     coalesce(p_source, 'edit_produk'), p_changed_by,
     coalesce(v_name, '-'), p_id_referensi);
end;
$$;

grant execute on function public.fn_append_price_movement(uuid, text, numeric, numeric, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 4. Trigger — ikut mencatat id_referensi dari GUC transaksi
--    (di-set oleh fn_sync_purchase_price saat pembelian / revert).
-- ------------------------------------------------------------
create or replace function public.fn_log_price_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_ref    uuid;
begin
  v_source := coalesce(current_setting('app.price_movement_source', true), 'edit_produk');
  v_ref    := nullif(current_setting('app.id_referensi', true), '')::uuid;

  if new.purchase_price is distinct from old.purchase_price then
    perform public.fn_append_price_movement(
      new.id, 'purchase_price',
      old.purchase_price, new.purchase_price,
      v_source, new.updated_by, v_ref
    );
  end if;

  if new.sale_price is distinct from old.sale_price then
    perform public.fn_append_price_movement(
      new.id, 'sale_price',
      old.sale_price, new.sale_price,
      v_source, new.updated_by, v_ref
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
-- 5. fn_sync_purchase_price — satu-satunya jalur sinkronisasi
--    harga beli dari pembelian. Syarat: BARANG_DITERIMA + LUNAS.
--    Mencatat ke price_movements dengan sumber 'pembelian' dan
--    id_referensi = purchase sehingga bisa di-revert saat hapus.
-- ------------------------------------------------------------
create or replace function public.fn_sync_purchase_price(
  p_purchase_id uuid,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase record;
  v_pi       record;
  v_synced   int := 0;
  v_reason   text := '';
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_purchase.status_barang <> 'BARANG_DITERIMA' then
    return jsonb_build_object('synced', 0, 'reason', 'belum_diterima');
  end if;
  if v_purchase.payment_status <> 'paid' then
    return jsonb_build_object('synced', 0, 'reason', 'belum_lunas');
  end if;

  perform set_config('app.price_movement_source', 'pembelian', true);
  perform set_config('app.id_referensi', p_purchase_id::text, true);

  for v_pi in
    select pi.* from public.purchase_items pi
     where pi.purchase_id = p_purchase_id
       and pi.cost_price > 0
     order by pi.created_at, pi.id
  loop
    if exists (
      select 1 from public.products p
       where p.id = v_pi.product_id
         and p.purchase_price is distinct from v_pi.cost_price
    ) then
      update public.products
         set purchase_price = v_pi.cost_price,
             updated_at     = now(),
             updated_by     = p_created_by
       where id = v_pi.product_id;
      v_synced := v_synced + 1;
    end if;
  end loop;

  perform set_config('app.price_movement_source', null, true);
  perform set_config('app.id_referensi', null, true);

  return jsonb_build_object('synced', v_synced, 'reason', 'ok');
end;
$$;

grant execute on function public.fn_sync_purchase_price(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 6. FN_CREATE_PURCHASE — tanpa sinkronisasi harga beli.
--    Draft hanya menyimpan item; harga produk TIDAK berubah.
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

grant execute on function public.fn_create_purchase(uuid, uuid, jsonb, text, date, numeric, text) to service_role;

-- ------------------------------------------------------------
-- 7. FN_UPDATE_PURCHASE — tanpa sinkronisasi harga beli.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 8. FN_RECEIVE_PURCHASE — terima barang: stok masuk selalu,
--    harga beli hanya bila LUNAS (via fn_sync_purchase_price).
-- ------------------------------------------------------------
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
  v_updated   int := 0;
  v_sync      jsonb;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase.status_barang in ('BARANG_DITERIMA', 'BATAL') then
    raise exception 'Pembelian sudah diterima atau dibatalkan' using errcode = 'P0001';
  end if;

  for v_pi in
    select pi.* from public.purchase_items pi where pi.purchase_id = p_purchase_id for update
  loop
    select stock into v_stock from public.products where id = v_pi.product_id for update;

    update public.products
       set stock      = stock + v_pi.quantity,
           updated_at = now(),
           updated_by = p_created_by
     where id = v_pi.product_id;
    v_updated := v_updated + 1;

    insert into public.inventory_movements
      (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
    values (v_pi.product_id, 'PURCHASE', v_pi.quantity, v_stock, v_stock + v_pi.quantity,
            p_purchase_id, 'purchase', 'Pembelian ' || v_purchase.purchase_number, p_created_by);
  end loop;

  update public.purchases
     set status_barang = 'BARANG_DITERIMA', status = 'received',
         updated_at = now(), updated_by = p_created_by
   where id = p_purchase_id;

  -- Sinkronkan harga hanya bila pembelian sudah LUNAS
  if v_purchase.payment_status = 'paid' then
    v_sync := public.fn_sync_purchase_price(p_purchase_id, p_created_by);
  else
    v_sync := jsonb_build_object('synced', 0, 'reason', 'belum_lunas');
  end if;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'PURCHASE_RECEIVED', 'purchases', p_purchase_id,
          jsonb_build_object(
            'purchase_number', v_purchase.purchase_number,
            'items_updated', v_updated,
            'price_synced', (v_sync ->> 'synced')::int
          ));

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'status', 'received',
    'status_barang', 'BARANG_DITERIMA',
    'items_updated', v_updated,
    'price_synced', (v_sync ->> 'synced')::int > 0,
    'price_updated', (v_sync ->> 'synced')::int > 0,
    'price_reason', v_sync ->> 'reason'
  );
end;
$$;

grant execute on function public.fn_receive_purchase(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 9. FN_SET_PURCHASE_PAYMENT_STATUS — ubah status pembayaran.
--    Saat dinyatakan LUNAS pada pembelian BARANG_DITERIMA yang
--    belum lunas, harga beli langsung disinkronkan.
-- ------------------------------------------------------------
create or replace function public.fn_set_purchase_payment_status(
  p_purchase_id   uuid,
  p_payment_status text,
  p_created_by    uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_purchase record;
  v_sync     jsonb;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase.status_barang = 'BATAL' then
    raise exception 'Pembelian dibatalkan' using errcode = 'P0001';
  end if;
  if p_payment_status not in ('unpaid', 'partial', 'paid') then
    raise exception 'Status pembayaran tidak valid' using errcode = 'P0001';
  end if;

  update public.purchases
     set payment_status = p_payment_status,
         updated_at     = now(),
         updated_by     = p_created_by
   where id = p_purchase_id;

  -- Sinkronkan harga beli saat pembelian dinyatakan LUNAS
  if p_payment_status = 'paid' and v_purchase.status_barang = 'BARANG_DITERIMA' then
    v_sync := public.fn_sync_purchase_price(p_purchase_id, p_created_by);
  else
    v_sync := jsonb_build_object('synced', 0, 'reason', 'tidak_perlu');
  end if;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'PURCHASE_PAYMENT_UPDATED', 'purchases', p_purchase_id,
          jsonb_build_object(
            'purchase_number', v_purchase.purchase_number,
            'payment_status', p_payment_status,
            'price_synced', (v_sync ->> 'synced')::int
          ));

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'payment_status', p_payment_status,
    'status_barang', v_purchase.status_barang,
    'price_synced', (v_sync ->> 'synced')::int > 0,
    'price_updated', (v_sync ->> 'synced')::int > 0,
    'price_reason', v_sync ->> 'reason'
  );
end;
$$;

grant execute on function public.fn_set_purchase_payment_status(uuid, text, uuid) to service_role;

-- ------------------------------------------------------------
-- 10. FN_DELETE_PURCHASE — hapus pembelian.
--     DRAFT: hapus langsung (tanpa efek harga).
--     BARANG_DITERIMA: revert harga beli produk ke harga semula
--     (dari price_movements ber-id_referensi purchase ini) lalu
--     hapus catatan purchase-origin tsb.
--     BATAL: ditolak.
-- ------------------------------------------------------------
create or replace function public.fn_delete_purchase(
  p_purchase_id uuid,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_purchase record;
  v_pm       record;
  v_reverted int := 0;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase.status_barang = 'BATAL' then
    raise exception 'Pembelian yang dibatalkan tidak dapat dihapus' using errcode = 'P0001';
  end if;

  if v_purchase.status_barang = 'BARANG_DITERIMA' then
    perform set_config('app.price_movement_source', 'pembelian', true);
    perform set_config('app.id_referensi', p_purchase_id::text, true);

    for v_pm in
      select distinct on (m.product_id) m.product_id, m.old_value
        from public.price_movements m
       where m.id_referensi = p_purchase_id
         and m.price_type = 'purchase_price'
       order by m.product_id, m.created_at asc, m.id asc
    loop
      update public.products
         set purchase_price = v_pm.old_value,
             updated_at     = now(),
             updated_by     = p_created_by
       where id = v_pm.product_id;
      v_reverted := v_reverted + 1;
    end loop;

    delete from public.price_movements where id_referensi = p_purchase_id;
  end if;

  delete from public.purchases where id = p_purchase_id;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'PURCHASE_DELETED', 'purchases', p_purchase_id,
          jsonb_build_object(
            'purchase_number', v_purchase.purchase_number,
            'price_reverted', v_reverted
          ));

  return jsonb_build_object('deleted', true, 'price_reverted', v_reverted);
end;
$$;

grant execute on function public.fn_delete_purchase(uuid, uuid) to service_role;