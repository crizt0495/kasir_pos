-- ============================================================
-- POS APP — 0014_debt_payments_and_cancel.sql
-- ------------------------------------------------------------
-- Penyempurnaan fitur hutang di atas baseline 0012/0013 (idempoten).
-- Berlaku additive — TIDAK mengubah logika/return yang sudah
-- diverifikasi E2E, hanya menambah:
--  1. Tabel debt_payments (riwayat pembayaran hutang) — spec §9
--  2. fn_pay_debt tetap 3-arg (backward compatible) tapi kini
--     MENCATAT riwayat ke debt_payments
--  3. fn_pay_debt overload 5-arg (payment_method + notes)
--  4. fn_get_debt_payment_history (riwayat pembayaran per hutang)
--  5. fn_cancel_debt (pembatalan/void dengan alasan) — spec §20
--  6. RLS + index + grant untuk service_role
-- ============================================================

-- ============================================================
-- 1. TABEL RIWAYAT PEMBAYARAN HUTANG
-- ============================================================

create table if not exists public.debt_payments (
  id              uuid primary key default gen_random_uuid(),
  debt_id         uuid not null references public.customer_debts(id) on delete cascade,
  amount          numeric(15,2) not null check (amount > 0),
  payment_method  text not null default 'CASH',
  notes           text,
  paid_at         timestamptz not null default now(),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_debt_payments_debt on public.debt_payments (debt_id, paid_at desc);
create index if not exists idx_debt_payments_paid_at on public.debt_payments (paid_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_debt_payments_set_updated_at') then
    create trigger trg_debt_payments_set_updated_at before update on public.debt_payments
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.debt_payments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'debt_payments' and policyname = 'debt_payments_select') then
    create policy debt_payments_select on public.debt_payments
      for select using (public.has_permission('customers.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'debt_payments' and policyname = 'debt_payments_insert') then
    create policy debt_payments_insert on public.debt_payments
      for insert with check (public.has_permission('customers.update'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'debt_payments' and policyname = 'debt_payments_update') then
    create policy debt_payments_update on public.debt_payments
      for update using (public.has_permission('customers.update'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'debt_payments' and policyname = 'debt_payments_delete') then
    create policy debt_payments_delete on public.debt_payments
      for delete using (public.has_permission('customers.delete'));
  end if;
end;
$$;

-- ============================================================
-- 2. FN_PAY_DEBT — 3-ARG (backward compatible) +
--    CATAT RIWAYAT KE DEBT_PAYMENTS
--    Logika sama dengan versi 0012 yang sudah diverifikasi E2E,
--    hanya menambah insert riwayat pembayaran.
-- ============================================================

create or replace function public.fn_pay_debt(
  p_debt_id      uuid,
  p_amount       numeric,
  p_created_by   uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_customer_id uuid;
  v_amount numeric;
  v_paid_amount numeric;
  v_remaining numeric;
  v_amount_to_pay numeric;
  v_old_remaining numeric;
  v_new_remaining numeric;
  v_customer_pending_debt numeric;
  v_payment_id uuid;
begin
  -- Validasi input
  if p_amount <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari 0' using errcode = 'P0001';
  end if;

  -- Ambil data hutang
  select customer_id, amount, paid_amount, remaining_amount
    into v_customer_id, v_amount, v_paid_amount, v_remaining
    from public.customer_debts
    where id = p_debt_id
    for update;

  if not found then
    raise exception 'Hutang tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_remaining <= 0 then
    raise exception 'Hutang sudah lunas' using errcode = 'P0001';
  end if;

  v_old_remaining := v_remaining;
  v_amount_to_pay := least(p_amount, v_remaining);
  v_new_remaining := v_remaining - v_amount_to_pay;

  update public.customer_debts
    set paid_amount = paid_amount + v_amount_to_pay,
        remaining_amount = v_new_remaining,
        status = case when v_new_remaining <= 0 then 'paid' else 'partial' end,
        updated_at = now(),
        updated_by = p_created_by
    where id = p_debt_id;

  -- Kurangi pending_debt customer ketika lunas
  if v_old_remaining > 0 and v_new_remaining = 0 then
    update public.customers
      set pending_debt = greatest(pending_debt - v_amount_to_pay, 0),
          updated_at = now(),
          updated_by = p_created_by
      where id = v_customer_id;
  end if;

  -- Catat riwayat pembayaran (spec §9)
  insert into public.debt_payments (debt_id, amount, created_by)
  values (p_debt_id, v_amount_to_pay, p_created_by)
  returning id into v_payment_id;

  -- Catat audit
  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (
    p_created_by,
    (select username from public.users where id = p_created_by),
    'DEBT_PAID',
    'customer_debts',
    p_debt_id,
    jsonb_build_object(
      'debt_id', p_debt_id,
      'payment_id', v_payment_id,
      'amount_paid', v_amount_to_pay,
      'new_remaining', v_new_remaining,
      'new_status', case when v_new_remaining <= 0 then 'paid' else 'partial' end
    )
  );

  return jsonb_build_object(
    'debt_id', p_debt_id,
    'payment_id', v_payment_id,
    'amount_paid', v_amount_to_pay,
    'paid_amount', v_paid_amount + v_amount_to_pay,
    'remaining_amount', v_new_remaining,
    'status', case when v_new_remaining <= 0 then 'paid' else 'partial' end
  );
end;
$$;

-- ============================================================
-- 3. FN_PAY_DEBT — OVERLOAD 5-ARG (payment_method + notes)
--    Dipakai UI bayar hutang bila ingin mencatat metode.
-- ============================================================

create or replace function public.fn_pay_debt(
  p_debt_id        uuid,
  p_amount         numeric,
  p_created_by     uuid,
  p_payment_method text default 'CASH',
  p_notes          text default null
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_customer_id uuid;
  v_amount numeric;
  v_paid_amount numeric;
  v_remaining numeric;
  v_amount_to_pay numeric;
  v_old_remaining numeric;
  v_new_remaining numeric;
  v_customer_pending_debt numeric;
  v_payment_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari 0' using errcode = 'P0001';
  end if;

  select customer_id, amount, paid_amount, remaining_amount
    into v_customer_id, v_amount, v_paid_amount, v_remaining
    from public.customer_debts
    where id = p_debt_id
    for update;

  if not found then
    raise exception 'Hutang tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_remaining <= 0 then
    raise exception 'Hutang sudah lunas' using errcode = 'P0001';
  end if;

  v_old_remaining := v_remaining;
  v_amount_to_pay := least(p_amount, v_remaining);
  v_new_remaining := v_remaining - v_amount_to_pay;

  update public.customer_debts
    set paid_amount = paid_amount + v_amount_to_pay,
        remaining_amount = v_new_remaining,
        status = case when v_new_remaining <= 0 then 'paid' else 'partial' end,
        updated_at = now(),
        updated_by = p_created_by
    where id = p_debt_id;

  if v_old_remaining > 0 and v_new_remaining = 0 then
    update public.customers
      set pending_debt = greatest(pending_debt - v_amount_to_pay, 0),
          updated_at = now(),
          updated_by = p_created_by
      where id = v_customer_id;
  end if;

  insert into public.debt_payments (debt_id, amount, payment_method, notes, created_by)
  values (p_debt_id, v_amount_to_pay, p_payment_method, p_notes, p_created_by)
  returning id into v_payment_id;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (
    p_created_by,
    (select username from public.users where id = p_created_by),
    'DEBT_PAID',
    'customer_debts',
    p_debt_id,
    jsonb_build_object(
      'debt_id', p_debt_id,
      'payment_id', v_payment_id,
      'amount_paid', v_amount_to_pay,
      'new_remaining', v_new_remaining,
      'payment_method', p_payment_method,
      'notes', p_notes,
      'new_status', case when v_new_remaining <= 0 then 'paid' else 'partial' end
    )
  );

  return jsonb_build_object(
    'debt_id', p_debt_id,
    'payment_id', v_payment_id,
    'amount_paid', v_amount_to_pay,
    'paid_amount', v_paid_amount + v_amount_to_pay,
    'remaining_amount', v_new_remaining,
    'status', case when v_new_remaining <= 0 then 'paid' else 'partial' end
  );
end;
$$;

-- ============================================================
-- 4. FN_GET_DEBT_PAYMENT_HISTORY — riwayat pembayaran per hutang
-- ============================================================

create or replace function public.fn_get_debt_payment_history(p_debt_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_debt jsonb;
  v_payments jsonb;
begin
  select jsonb_build_object(
    'id', cd.id,
    'customer_id', cd.customer_id,
    'customer_name', c.name,
    'amount', cd.amount,
    'paid_amount', cd.paid_amount,
    'remaining_amount', cd.remaining_amount,
    'status', cd.status,
    'due_date', cd.due_date,
    'notes', cd.notes,
    'sale_id', cd.sale_id,
    'created_at', cd.created_at
  ) into v_debt
  from public.customer_debts cd
  join public.customers c on c.id = cd.customer_id
  where cd.id = p_debt_id;

  if v_debt is null then
    return jsonb_build_object('error', 'Hutang tidak ditemukan');
  end if;

  select coalesce(jsonb_agg(row order by paid_at), '[]'::jsonb) into v_payments
  from (
    select
      dp.id,
      dp.amount,
      dp.payment_method,
      dp.notes,
      dp.paid_at,
      dp.created_at,
      (select username from public.users where id = dp.created_by) as created_by_name
    from public.debt_payments dp
    where dp.debt_id = p_debt_id
  ) row;

  return jsonb_build_object('debt', v_debt, 'payments', v_payments);
end;
$$;

-- ============================================================
-- 5. FN_GET_DEBT_SUMMARY — ringkasan hutang untuk dashboard/laporan
-- ============================================================

create or replace function public.fn_get_debt_summary(
  p_from date default null,
  p_to   date default null
) returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_total_pending numeric := 0;
  v_total_paid numeric := 0;
  v_total_overdue numeric := 0;
  v_total_all numeric := 0;
  v_count_pending int := 0;
  v_count_paid int := 0;
  v_count_overdue int := 0;
  v_count_partial int := 0;
  v_count_all int := 0;
  v_customers_with_debt int := 0;
  v_paid_today numeric := 0;
  v_new_debt_today numeric := 0;
begin
  select
    coalesce(sum(case when status in ('pending','partial','overdue') then remaining_amount else 0 end), 0),
    coalesce(sum(case when status = 'paid' then amount else 0 end), 0),
    coalesce(sum(case when status = 'overdue' then remaining_amount else 0 end), 0),
    coalesce(sum(amount), 0),
    count(*) filter (where status in ('pending','partial','overdue')),
    count(*) filter (where status = 'paid'),
    count(*) filter (where status = 'overdue'),
    count(*) filter (where status = 'partial'),
    count(*)
  into
    v_total_pending, v_total_paid, v_total_overdue, v_total_all,
    v_count_pending, v_count_paid, v_count_overdue, v_count_partial, v_count_all
  from public.customer_debts
  where status != 'cancelled'
    and (p_from is null or date(created_at) >= p_from)
    and (p_to is null or date(created_at) <= p_to);

  select count(distinct customer_id) into v_customers_with_debt
  from public.customer_debts
  where status in ('pending', 'partial', 'overdue');

  select coalesce(sum(amount), 0) into v_paid_today
  from public.debt_payments
  where date(paid_at) = current_date;

  select coalesce(sum(amount), 0) into v_new_debt_today
  from public.customer_debts
  where date(created_at) = current_date and status != 'cancelled';

  return jsonb_build_object(
    'total_pending', v_total_pending,
    'total_paid', v_total_paid,
    'total_overdue', v_total_overdue,
    'total_all', v_total_all,
    'count_pending', v_count_pending,
    'count_paid', v_count_paid,
    'count_overdue', v_count_overdue,
    'count_partial', v_count_partial,
    'count_all', v_count_all,
    'customers_with_debt', v_customers_with_debt,
    'paid_today', v_paid_today,
    'new_debt_today', v_new_debt_today
  );
end;
$$;

-- ============================================================
-- 6. FN_CANCEL_DEBT — pembatalan/void hutang dengan alasan
--    Hutang TIDAK dihapus (tetap di audit), ditandai cancelled.
-- ============================================================

create or replace function public.fn_cancel_debt(
  p_debt_id     uuid,
  p_reason      text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_debt record;
  v_old_status text;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;

  select * into v_debt from public.customer_debts where id = p_debt_id for update;
  if v_debt.id is null then
    raise exception 'Hutang tidak ditemukan' using errcode = 'P0001';
  end if;

  v_old_status := v_debt.status;

  if v_debt.status = 'cancelled' then
    raise exception 'Hutang sudah dibatalkan' using errcode = 'P0001';
  end if;

  if v_debt.paid_amount > 0 then
    raise exception 'Hutang yang sudah dibayar sebagian tidak dapat dibatalkan. Sisa hutang harus dilunasi terlebih dahulu.' using errcode = 'P0001';
  end if;

  update public.customer_debts
    set status = 'cancelled',
        notes = coalesce(notes, '') || case when notes is null or notes = '' then '' else E'\n' end ||
                '[DIBATALKAN ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || p_reason,
        updated_at = now(),
        updated_by = p_created_by
    where id = p_debt_id;

  update public.customers
    set pending_debt = greatest(coalesce(pending_debt, 0) - v_debt.remaining_amount, 0),
        updated_at = now(),
        updated_by = p_created_by
    where id = v_debt.customer_id;

  insert into public.audit_logs (user_id, username, action, module, record_id, old_data, new_data)
  values (
    p_created_by,
    (select username from public.users where id = p_created_by),
    'DEBT_CANCELLED',
    'customer_debts',
    p_debt_id,
    jsonb_build_object('status', v_old_status, 'remaining_amount', v_debt.remaining_amount),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason)
  );

  return jsonb_build_object(
    'debt_id', p_debt_id,
    'status', 'cancelled',
    'old_status', v_old_status,
    'cancelled_at', now()
  );
end;
$$;

-- ============================================================
-- 7. FN_CREATE_SALE — RECREATE dengan p_record_debt (fix missing param)
-- ============================================================
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
  p_session_id      uuid default null,
  p_allow_partial   boolean default false,
  p_record_debt     jsonb default null
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
  v_debt_id         uuid;
  v_debt_amount     numeric := 0;
  v_debt_recorded   boolean := false;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang tidak boleh kosong' using errcode = 'P0001';
  end if;

  select coalesce((value ->> 'allow_negative_stock')::boolean, false)
    into v_allow_negative from public.settings where key = 'inventory';
  select coalesce(value ->> 'prefix', 'INV') into v_prefix
    from public.settings where key = 'invoice';

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

  if p_payment_method = 'CASH' and p_cash_received is not null and not p_allow_partial then
    v_change := p_cash_received - v_total;
    if v_change < 0 then
      raise exception 'Jumlah bayar kurang dari total transaksi' using errcode = 'P0001';
    end if;
  elsif p_payment_method = 'CASH' and p_cash_received is not null and p_allow_partial then
    v_change := p_cash_received - v_total;
  end if;

  if p_allow_partial and p_payment_method = 'CASH' and p_cash_received is not null then
    v_debt_amount := greatest(v_total - p_cash_received, 0);
  elsif p_record_debt is not null and (p_record_debt->>'amount')::numeric > 0 then
    v_debt_amount := (p_record_debt->>'amount')::numeric;
  end if;

  insert into public.sale_payments (sale_id, amount, payment_method, cash_received, change_amount)
  values (v_sale_id, v_total, p_payment_method, p_cash_received, v_change);

  update public.sales
     set subtotal = v_subtotal, discount = p_discount, tax = p_tax,
         additional_cost = p_additional_cost, total = v_total,
         total_cost = v_total_cost, profit = v_profit
   where id = v_sale_id;

  if v_debt_amount > 0 and p_customer_id is not null then
    if exists (select 1 from public.customers where id = p_customer_id and is_general = true) then
      raise exception 'Pelanggan Umum tidak dapat memiliki hutang' using errcode = 'P0001';
    end if;

    declare
      v_due_date date := current_date + interval '30 days';
      v_debt_notes text := null;
    begin
      if p_record_debt is not null then
        if nullif(p_record_debt->>'due_date', '') is not null then
          v_due_date := (p_record_debt->>'due_date')::date;
        end if;
        v_debt_notes := nullif(p_record_debt->>'notes', '');
      else
        v_debt_notes := 'Hutang dari transaksi ' || v_invoice;
      end if;

      insert into public.customer_debts (
        customer_id, amount, paid_amount, remaining_amount, due_date,
        status, notes, created_by, updated_by, sale_id
      ) values (
        p_customer_id, v_debt_amount, 0, v_debt_amount, v_due_date,
        'pending', v_debt_notes, p_created_by, p_created_by, v_sale_id
      ) returning id into v_debt_id;

      update public.customers
        set total_debt = coalesce(total_debt, 0) + v_debt_amount,
            pending_debt = coalesce(pending_debt, 0) + v_debt_amount,
            updated_at = now(),
            updated_by = p_created_by
        where id = p_customer_id;

      v_debt_recorded := true;
    end;
  end if;

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
                             'profit', v_profit, 'items', jsonb_array_length(p_items),
                             'debt_amount', v_debt_amount));

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
    'change', v_change,
    'debt_id', case when v_debt_recorded then v_debt_id else null end,
    'debt_amount', v_debt_amount
  );
end;
$$;

-- ============================================================
-- 8. GRANT & INDEX
-- ============================================================

grant execute on function public.fn_pay_debt(uuid, numeric, uuid) to service_role;
grant execute on function public.fn_pay_debt(uuid, numeric, uuid, text, text) to service_role;
grant execute on function public.fn_get_debt_payment_history(uuid) to service_role;
grant execute on function public.fn_get_debt_summary(date, date) to service_role;
grant execute on function public.fn_cancel_debt(uuid, text, uuid) to service_role;
grant execute on function public.fn_create_sale(uuid, uuid, jsonb, uuid, numeric, numeric, numeric, text, numeric, text, uuid, boolean, jsonb) to service_role;

create index if not exists idx_customer_debts_status_due on public.customer_debts (status, due_date);
create index if not exists idx_customer_debts_customer_status on public.customer_debts (customer_id, status);