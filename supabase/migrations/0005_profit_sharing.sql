-- ============================================================
-- POS APP — 0005_profit_sharing.sql
-- 1. Role disederhanakan: Owner + Kasir (2 role saja).
-- 2. Snapshot laba per transaksi: sale_items.cost_price/profit,
--    sales.total_cost/profit (harga beli & jual dibekukan saat
--    transaksi, perubahan harga produk tidak mengubah laba lama).
-- 3. Sistem bagi hasil 2,5% tahunan: profit_periods,
--    customer_profit_shares, profit_distributions.
--    Nilai 2,5% = Total Laba Pelanggan × 2,5% (BUKAN dari omzet).
-- 4. Pelanggan "Umum" (is_general) — dikecualikan dari bagi hasil.
-- 5. Notifikasi: notification_subscriptions (web push) &
--    notification_logs (riwayat status sent/failed/read).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ROLE — hanya Owner & Kasir
-- ------------------------------------------------------------
update public.roles
   set name = 'Owner',
       code = 'owner',
       description = 'Pemilik toko — akses penuh ke semua fitur',
       updated_at = now()
 where code = 'super_admin';

-- Hapus role perantara (relasi role_permissions & user_roles ikut cascade)
delete from public.roles where code in ('admin', 'supervisor', 'gudang');

-- ------------------------------------------------------------
-- 2. PERMISSION BARU (profit & notifikasi)
-- ------------------------------------------------------------
insert into public.permissions (code, name, module, description) values
  ('profit.view',           'Lihat Laba & Bagi Hasil', 'profit',   'Melihat laba transaksi dan hak bagi hasil pelanggan'),
  ('profit.distribute',     'Bagikan Bagi Hasil',      'profit',   'Membagikan bagi hasil 2,5% ke pelanggan'),
  ('notifications.view',    'Lihat Notifikasi',        'notifications', 'Melihat riwayat notifikasi penjualan')
on conflict (code) do nothing;

-- Owner mendapat SEMUA permission
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'owner'
on conflict do nothing;

-- Kasir: hanya akses operasional transaksi (tidak berubah, tetap minimal)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.code = 'kasir' and (
  p.code in ('dashboard.view', 'pos.access', 'sales.view', 'sales.create',
             'customers.view', 'customers.create', 'customers.update',
             'cashier.open', 'cashier.close', 'products.view')
)
on conflict do nothing;

-- ------------------------------------------------------------
-- 3. SNAPSHOT LABA PADA TRANSAKSI
-- ------------------------------------------------------------
alter table public.sale_items
  add column if not exists cost_price numeric(15,2) not null default 0,
  add column if not exists profit     numeric(15,2) not null default 0;

alter table public.sales
  add column if not exists total_cost numeric(15,2) not null default 0,
  add column if not exists profit     numeric(15,2) not null default 0;

-- ------------------------------------------------------------
-- 4. PELANGGAN UMUM (dikecualikan dari bagi hasil 2,5%)
-- ------------------------------------------------------------
alter table public.customers
  add column if not exists is_general boolean not null default false;

insert into public.customers (name, is_general, notes)
select 'Pelanggan Umum', true, 'Pelanggan default untuk transaksi tanpa identitas'
where not exists (select 1 from public.customers where name = 'Pelanggan Umum');

-- ------------------------------------------------------------
-- 5. BAGI HASIL 2,5% TAHUNAN
-- ------------------------------------------------------------
create table if not exists public.profit_periods (
  id            uuid primary key default gen_random_uuid(),
  year          integer not null unique,
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'open' check (status in ('open', 'closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.users(id)
);

create table if not exists public.customer_profit_shares (
  id              uuid primary key default gen_random_uuid(),
  period_id       uuid not null references public.profit_periods(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  total_purchase  numeric(15,2) not null default 0,
  total_profit    numeric(15,2) not null default 0,
  share_amount    numeric(15,2) not null default 0,
  status          text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (period_id, customer_id)
);

create table if not exists public.profit_distributions (
  id              uuid primary key default gen_random_uuid(),
  period_id       uuid not null references public.profit_periods(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  amount          numeric(15,2) not null check (amount > 0),
  distributed_at  timestamptz not null default now(),
  distributed_by  uuid references public.users(id),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_shares_period on public.customer_profit_shares (period_id, total_profit desc);
create index if not exists idx_distributions_period on public.profit_distributions (period_id, distributed_at desc);

-- Trigger updated_at
create trigger trg_profit_periods_updated_at before update on public.profit_periods
for each row execute function public.set_updated_at();
create trigger trg_shares_updated_at before update on public.customer_profit_shares
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6. NOTIFIKASI
-- ------------------------------------------------------------
create table if not exists public.notification_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  endpoint      text not null unique,
  keys          jsonb not null default '{}'::jsonb,
  user_agent    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.notification_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete set null,
  type          text not null default 'SALE',
  title         text not null,
  body          text,
  payload       jsonb,
  status        text not null default 'sent' check (status in ('sent', 'failed', 'read')),
  error         text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notif_logs_user on public.notification_logs (user_id, created_at desc);
create trigger trg_notif_subs_updated_at before update on public.notification_subscriptions
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 7. RLS untuk tabel baru (defense in depth — backend tetap
--    memakai SERVICE ROLE KEY + requirePermission)
-- ------------------------------------------------------------
alter table public.profit_periods enable row level security;
alter table public.customer_profit_shares enable row level security;
alter table public.profit_distributions enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.notification_logs enable row level security;

select public.enable_crud_policies('profit_periods', 'profit');
select public.enable_crud_policies('customer_profit_shares', 'profit');
select public.enable_crud_policies('profit_distributions', 'profit');

-- Subskripsi push: user hanya mengelola miliknya sendiri
create policy notif_subs_select on public.notification_subscriptions
  for select using (public.current_user_id() = user_id);
create policy notif_subs_insert on public.notification_subscriptions
  for insert with check (public.current_user_id() = user_id);
create policy notif_subs_delete on public.notification_subscriptions
  for delete using (public.current_user_id() = user_id);

-- Riwayat notifikasi: hanya yang punya notifications.view
create policy notif_logs_select on public.notification_logs
  for select using (public.has_permission('notifications.view'));
create policy notif_logs_insert on public.notification_logs
  for insert with check (public.has_permission('notifications.view'));
create policy notif_logs_update on public.notification_logs
  for update using (public.has_permission('notifications.view'));

-- ------------------------------------------------------------
-- 8. FUNGSI BANTU — upsert share bagi hasil (dipanggil saat
--    penjualan & retur). Pelanggan umum / null TIDAK dihitung.
-- ------------------------------------------------------------
create or replace function public.fn_upsert_profit_share(
  p_customer_id     uuid,
  p_date            date,
  p_purchase_delta  numeric,
  p_profit_delta    numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_year      int;
  v_period_id uuid;
begin
  if p_customer_id is null then
    return;
  end if;
  -- Pelanggan umum tidak masuk perhitungan bagi hasil
  if not exists (
    select 1 from public.customers
     where id = p_customer_id and coalesce(is_general, false) = false
  ) then
    return;
  end if;

  v_year := extract(year from p_date);

  insert into public.profit_periods (year, start_date, end_date, status)
  values (v_year, make_date(v_year, 1, 1), make_date(v_year, 12, 31), 'open')
  on conflict (year) do nothing;

  select id into v_period_id from public.profit_periods where year = v_year;

  insert into public.customer_profit_shares
    (period_id, customer_id, total_purchase, total_profit, share_amount, status)
  values (v_period_id, p_customer_id, p_purchase_delta, p_profit_delta,
          greatest(p_profit_delta, 0) * 0.025, 'unpaid')
  on conflict (period_id, customer_id) do update set
    total_purchase = public.customer_profit_shares.total_purchase + excluded.total_purchase,
    total_profit   = public.customer_profit_shares.total_profit + excluded.total_profit,
    share_amount   = greatest(public.customer_profit_shares.total_profit + excluded.total_profit, 0) * 0.025,
    -- Ada profit baru / koreksi retur → hak lagi belum dibagikan
    status         = 'unpaid',
    updated_at     = now();
end;
$$;

-- ------------------------------------------------------------
-- 9. DISTRIBUSI BAGI HASIL (atomic, tercatat di history)
-- ------------------------------------------------------------
create or replace function public.fn_distribute_profit(
  p_period_id       uuid,
  p_customer_id     uuid,
  p_amount          numeric,
  p_created_by      uuid,
  p_note            text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_share        record;
  v_distributed  numeric;
  v_remaining    numeric;
begin
  if p_amount <= 0 then
    raise exception 'Nominal pembagian harus lebih dari 0' using errcode = 'P0001';
  end if;

  select * into v_share
    from public.customer_profit_shares
   where period_id = p_period_id and customer_id = p_customer_id
   for update;

  if v_share.id is null then
    raise exception 'Data bagi hasil pelanggan tidak ditemukan' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_distributed
    from public.profit_distributions
   where period_id = p_period_id and customer_id = p_customer_id;

  v_remaining := v_share.share_amount - v_distributed;
  if p_amount > v_remaining then
    raise exception 'Nominal melebihi sisa hak bagi hasil (sisa %)', v_remaining using errcode = 'P0001';
  end if;

  insert into public.profit_distributions
    (period_id, customer_id, amount, distributed_by, note)
  values (p_period_id, p_customer_id, p_amount, p_created_by, p_note);

  v_distributed := v_distributed + p_amount;

  update public.customer_profit_shares
     set status = case when v_distributed >= share_amount then 'paid' else 'unpaid' end,
         updated_at = now()
   where id = v_share.id;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'PROFIT_DISTRIBUTED', 'profit', v_share.id,
          jsonb_build_object('period_id', p_period_id, 'customer_id', p_customer_id,
                             'amount', p_amount, 'note', p_note));

  return jsonb_build_object(
    'distribution_id', (select id from public.profit_distributions
                         where period_id = p_period_id and customer_id = p_customer_id
                         order by created_at desc limit 1),
    'amount', p_amount,
    'remaining', greatest(v_share.share_amount - v_distributed, 0),
    'status', case when v_distributed >= v_share.share_amount then 'paid' else 'unpaid' end
  );
end;
$$;

-- ------------------------------------------------------------
-- 10. FN_CREATE_SALE — snapshot cost/profit + update bagi hasil
-- ------------------------------------------------------------
create or replace function public.fn_create_sale(
  p_cashier_id      uuid,
  p_created_by      uuid,
  p_items           jsonb,
  p_customer_id     uuid default null,
  p_discount        numeric default 0,
  p_tax             numeric default 0,
  p_additional_cost numeric default 0,
  p_payment_method  text default 'CASH',
  p_cash_received   numeric default null,
  p_notes           text default null,
  p_session_id      uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sale_id         uuid;
  v_invoice         text;
  v_counter         int;
  v_item            jsonb;
  v_product_id      uuid;
  v_qty             numeric;
  v_price           numeric;
  v_item_disc       numeric;
  v_cost            numeric;
  v_item_profit     numeric;
  v_subtotal        numeric := 0;
  v_total_cost      numeric := 0;
  v_profit          numeric := 0;
  v_total           numeric;
  v_stock           numeric;
  v_allow_negative  boolean;
  v_change          numeric := 0;
  v_prefix          text := 'INV';
  v_product_name    text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang tidak boleh kosong' using errcode = 'P0001';
  end if;

  select coalesce((value ->> 'allow_negative_stock')::boolean, false)
    into v_allow_negative from public.settings where key = 'inventory';
  select coalesce(value ->> 'prefix', 'INV') into v_prefix
    from public.settings where key = 'invoice';

  -- Nomor transaksi: counter harian, anti race-condition (advisory lock)
  perform pg_advisory_xact_lock(hashtext('sale_counter'));
  insert into public.sale_counters (day, seq) values (current_date, 1)
  on conflict (day) do update set seq = public.sale_counters.seq + 1
  returning seq into v_counter;
  v_invoice := v_prefix || '-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 6, '0');

  insert into public.sales (invoice_number, customer_id, cashier_id, payment_method, status, notes, created_by, updated_by)
  values (v_invoice, p_customer_id, p_cashier_id, p_payment_method, 'completed', p_notes, p_created_by, p_created_by)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::numeric;
    v_price      := (v_item ->> 'price')::numeric;
    v_item_disc  := coalesce((v_item ->> 'discount')::numeric, 0);

    if v_qty <= 0 then
      raise exception 'Qty harus lebih dari 0' using errcode = 'P0001';
    end if;
    if v_price < 0 then
      raise exception 'Harga tidak boleh negatif' using errcode = 'P0001';
    end if;

    -- Snapshot harga beli saat transaksi (laba tidak berubah jika harga berubah nanti)
    select stock, name, purchase_price into v_stock, v_product_name, v_cost
      from public.products where id = v_product_id for update;

    if v_product_name is null then
      raise exception 'Produk tidak ditemukan' using errcode = 'P0001';
    end if;
    if v_stock < v_qty and not v_allow_negative then
      raise exception 'Stok tidak mencukupi untuk % (sisa %)', v_product_name, v_stock using errcode = 'P0001';
    end if;

    update public.products
       set stock = stock - v_qty, updated_at = now(), updated_by = p_created_by
     where id = v_product_id;

    -- Laba item = (Harga Jual - Harga Beli) × Qty (dikurangi diskon item)
    v_item_profit := (v_price * v_qty) - v_item_disc - (coalesce(v_cost, 0) * v_qty);

    insert into public.sale_items (sale_id, product_id, quantity, price, discount, subtotal, cost_price, profit)
    values (v_sale_id, v_product_id, v_qty, v_price, v_item_disc, (v_price * v_qty) - v_item_disc,
            coalesce(v_cost, 0), v_item_profit);

    insert into public.inventory_movements
      (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
    values (v_product_id, 'SALE', -v_qty, v_stock, v_stock - v_qty, v_sale_id, 'sale',
            'Penjualan ' || v_invoice, p_created_by);

    v_subtotal   := v_subtotal + (v_price * v_qty) - v_item_disc;
    v_total_cost := v_total_cost + (coalesce(v_cost, 0) * v_qty);
    v_profit     := v_profit + v_item_profit;
  end loop;

  v_total := v_subtotal - p_discount + p_tax + p_additional_cost;

  if p_payment_method = 'CASH' and p_cash_received is not null then
    v_change := p_cash_received - v_total;
    if v_change < 0 then
      raise exception 'Jumlah bayar kurang dari total transaksi' using errcode = 'P0001';
    end if;
  end if;

  insert into public.sale_payments (sale_id, amount, payment_method, cash_received, change_amount)
  values (v_sale_id, v_total, p_payment_method, p_cash_received, v_change);

  update public.sales
     set subtotal = v_subtotal, discount = p_discount, tax = p_tax,
         additional_cost = p_additional_cost, total = v_total,
         total_cost = v_total_cost, profit = v_profit
   where id = v_sale_id;

  -- Bagi hasil 2,5% pelanggan (di-skip untuk pelanggan umum / null)
  perform public.fn_upsert_profit_share(p_customer_id, current_date, v_total, v_profit);

  if p_session_id is not null then
    insert into public.cash_transactions
      (session_id, type, amount, reference_type, reference_id, notes, created_by)
    values (p_session_id, 'SALE', v_total, 'sale', v_sale_id, 'Penjualan ' || v_invoice, p_created_by);
  end if;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'SALE_CREATED', 'sales', v_sale_id,
          jsonb_build_object('invoice_number', v_invoice, 'total', v_total,
                             'profit', v_profit, 'items', jsonb_array_length(p_items)));

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'tax', p_tax,
    'additional_cost', p_additional_cost,
    'total', v_total,
    'total_cost', v_total_cost,
    'profit', v_profit,
    'payment_method', p_payment_method,
    'cash_received', p_cash_received,
    'change', v_change
  );
end;
$$;

-- ------------------------------------------------------------
-- 11. FN_REFUND_SALE — koreksi laba & hak 2,5% pelanggan
--     (transaksi asli TIDAK dihapus, retur dicatat terpisah)
-- ------------------------------------------------------------
create or replace function public.fn_refund_sale(
  p_sale_id       uuid,
  p_created_by    uuid,
  p_items         jsonb,
  p_reason        text default null,
  p_session_id    uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sale            record;
  v_item            jsonb;
  v_si              record;
  v_qty             numeric;
  v_return_id       uuid;
  v_return_number   text;
  v_counter         int;
  v_refund          numeric := 0;
  v_profit_refunded numeric := 0;
  v_stock           numeric;
  v_prefix          text := 'RET';
  v_fully_refunded  boolean;
  v_sold_total      numeric := 0;
  v_refunded_total  numeric := 0;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Transaksi tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Transaksi dibatalkan, tidak dapat diretur' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Pilih minimal satu item untuk retur' using errcode = 'P0001';
  end if;

  select coalesce(value ->> 'prefix', 'RET') into v_prefix
    from public.settings where key = 'invoice';

  perform pg_advisory_xact_lock(hashtext('return_counter'));
  insert into public.return_counters (day, seq) values (current_date, 1)
  on conflict (day) do update set seq = public.return_counters.seq + 1
  returning seq into v_counter;
  v_return_number := v_prefix || '-RET-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 6, '0');

  insert into public.returns (return_number, sale_id, customer_id, total_refund, reason, created_by)
  values (v_return_number, p_sale_id, v_sale.customer_id, 0, p_reason, p_created_by)
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select si.*, coalesce(sum(ri.quantity), 0) as returned_qty
      into v_si
      from public.sale_items si
      left join public.return_items ri on ri.sale_item_id = si.id
     where si.id = (v_item ->> 'sale_item_id')::uuid
       and si.sale_id = p_sale_id
     group by si.id;

    if v_si.id is null then
      raise exception 'Item tidak ditemukan pada transaksi ini' using errcode = 'P0001';
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty <= 0 or v_qty > (v_si.quantity - v_si.returned_qty) then
      raise exception 'Qty retur melebihi jumlah yang dapat diretur' using errcode = 'P0001';
    end if;

    select stock into v_stock from public.products where id = v_si.product_id for update;

    update public.products
       set stock = stock + v_qty, updated_at = now(), updated_by = p_created_by
     where id = v_si.product_id;

    insert into public.return_items
      (return_id, sale_item_id, product_id, quantity, price, refund_amount)
    values (v_return_id, v_si.id, v_si.product_id, v_qty, v_si.price, v_si.price * v_qty);

    insert into public.inventory_movements
      (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
    values (v_si.product_id, 'SALE_RETURN', v_qty, v_stock, v_stock + v_qty, v_return_id, 'return',
            'Retur ' || v_return_number, p_created_by);

    v_refund          := v_refund + (v_si.price * v_qty);
    -- Koreksi laba proporsional sesuai qty yang diretur
    v_profit_refunded := v_profit_refunded + (coalesce(v_si.profit, 0) * (v_qty / v_si.quantity));
  end loop;

  update public.returns set total_refund = v_refund where id = v_return_id;

  -- Rekalkulasi total_cost & profit sale dari sisa qty yang tidak diretur
  update public.sales
     set total_cost = coalesce((
           select sum(si.cost_price * (si.quantity - coalesce(rq.returned_qty, 0)))
             from public.sale_items si
             left join (
               select sale_item_id, sum(quantity) as returned_qty
                 from public.return_items group by sale_item_id
             ) rq on rq.sale_item_id = si.id
            where si.sale_id = p_sale_id
         ), 0),
         profit = coalesce((
           select sum(si.profit * (si.quantity - coalesce(rq.returned_qty, 0)) / si.quantity)
             from public.sale_items si
             left join (
               select sale_item_id, sum(quantity) as returned_qty
                 from public.return_items group by sale_item_id
             ) rq on rq.sale_item_id = si.id
            where si.sale_id = p_sale_id
         ), 0),
         status = 'partially_refunded',
         updated_at = now(), updated_by = p_created_by
   where id = p_sale_id;

  -- Status sale: refunded / partially_refunded
  select sum(quantity) into v_sold_total from public.sale_items where sale_id = p_sale_id;
  select coalesce(sum(ri.quantity), 0) into v_refunded_total
    from public.return_items ri join public.returns r on r.id = ri.return_id
   where r.sale_id = p_sale_id;
  v_fully_refunded := v_refunded_total >= v_sold_total;

  if v_fully_refunded then
    update public.sales set status = 'refunded', updated_at = now(), updated_by = p_created_by
     where id = p_sale_id;
  end if;

  -- Koreksi hak bagi hasil 2,5% pelanggan (negatif; di-skip utk pelanggan umum)
  perform public.fn_upsert_profit_share(v_sale.customer_id, current_date, -v_refund, -v_profit_refunded);

  -- Refund cash ke kas jika penjualan cash & ada session
  if p_session_id is not null and v_sale.payment_method = 'CASH' then
    insert into public.cash_transactions
      (session_id, type, amount, reference_type, reference_id, notes, created_by)
    values (p_session_id, 'REFUND', -v_refund, 'return', v_return_id,
            'Refund ' || v_return_number, p_created_by);
  end if;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'SALE_REFUNDED', 'sales', p_sale_id,
          jsonb_build_object('return_number', v_return_number, 'refund', v_refund,
                             'profit_correction', v_profit_refunded, 'reason', p_reason));

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'refund', v_refund,
    'profit_correction', v_profit_refunded,
    'sale_status', case when v_fully_refunded then 'refunded' else 'partially_refunded' end
  );
end;
$$;
