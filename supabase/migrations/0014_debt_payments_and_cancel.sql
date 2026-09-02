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
-- 6. GRANT & INDEX
-- ============================================================

grant execute on function public.fn_pay_debt(uuid, numeric, uuid) to service_role;
grant execute on function public.fn_pay_debt(uuid, numeric, uuid, text, text) to service_role;
grant execute on function public.fn_get_debt_payment_history(uuid) to service_role;
grant execute on function public.fn_get_debt_summary(date, date) to service_role;
grant execute on function public.fn_cancel_debt(uuid, text, uuid) to service_role;

create index if not exists idx_customer_debts_status_due on public.customer_debts (status, due_date);
create index if not exists idx_customer_debts_customer_status on public.customer_debts (customer_id, status);