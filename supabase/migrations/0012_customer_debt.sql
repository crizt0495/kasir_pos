-- ============================================================
-- POS APP — 0012_customer_debt.sql
-- Manajemen hutang/hutang pembayaran.
-- ------------------------------------------------------------
-- 1. Tabel customer_debts: tracking setiap hutang
-- 2. Kolom debt fields: total_debt, pending_debt di customers
-- 3. Fungsi RPC: fn_record_debt, fn_pay_debt
-- 4. Trigger untuk update otomatis debt di customers
-- 5. RLS policies
-- ============================================================

-- ------------------------------------------------------------
-- Tambah kolom debt di customers
-- ------------------------------------------------------------
alter table public.customers
  add column total_debt numeric(15,2) not null default 0,
  add column pending_debt numeric(15,2) not null default 0;

-- ------------------------------------------------------------
-- Buat tabel customer_debts
-- ------------------------------------------------------------
create table public.customer_debts (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers(id) on delete cascade,
  amount              numeric(15,2) not null check (amount >= 0),
  paid_amount         numeric(15,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  remaining_amount    numeric(15,2) not null default 0 check (remaining_amount >= 0),
  due_date            date not null,
  status              text not null default 'pending' check (status in ('pending', 'paid', 'partial', 'overdue', 'cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id)
);

-- ------------------------------------------------------------
-- Indeks
-- ------------------------------------------------------------
create index idx_customer_debts_customer on public.customer_debts (customer_id);
create index idx_customer_debts_status on public.customer_debts (status);
create index idx_customer_debts_due_date on public.customer_debts (due_date);

-- ------------------------------------------------------------
-- Fungsi transaksi untuk mencatat hutang baru
-- ------------------------------------------------------------
create or replace function public.fn_record_debt(
  p_customer_id    uuid,
  p_amount        numeric,
  p_due_date      date,
  p_notes         text default null,
  p_created_by    uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_customer record;
  v_debt_id        uuid;
  v_total_debt     numeric;
  v_pending_debt   numeric;
begin
  -- Validasi input
  if p_amount <= 0 then
    raise exception 'Jumlah hutang harus lebih dari 0' using errcode = 'P0001';
  end if;

  -- Ambil data customer
  select total_debt, pending_debt into v_customer from public.customers where id = p_customer_id for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan' using errcode = 'P0001';
  end if;

  -- Hitung hutang baru
  v_total_debt := v_customer.total_debt + p_amount;
  v_pending_debt := v_customer.pending_debt + p_amount;

  -- Insert hutang baru
  insert into public.customer_debts (
    customer_id, amount, paid_amount, remaining_amount, due_date, status, notes, created_by, updated_by
  ) values (
    p_customer_id, p_amount, 0, p_amount, p_due_date, 'pending', p_notes, p_created_by, p_created_by
  ) returning id into v_debt_id;

  -- Update customer
  update public.customers
    set total_debt = v_total_debt,
        pending_debt = v_pending_debt,
        updated_at = now(),
        updated_by = p_created_by
    where id = p_customer_id;

  -- Catat audit
  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (
    p_created_by,
    (select username from public.users where id = p_created_by),
    'DEBT_CREATED',
    'customer_debts',
    v_debt_id,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'amount', p_amount,
      'due_date', p_due_date,
      'notes', p_notes
    )
  );

  return jsonb_build_object(
    'debt_id', v_debt_id,
    'customer_id', p_customer_id,
    'amount', p_amount,
    'remaining_amount', p_amount,
    'status', 'pending'
  );
end;
$$;

-- ------------------------------------------------------------
-- Fungsi transaksi untuk membayar hutang
-- ------------------------------------------------------------
create or replace function public.fn_pay_debt(
  p_debt_id      uuid,
  p_amount       numeric,
  p_created_by   uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_customer record;
  v_debt record;
  v_amount_to_pay numeric;
  v_old_paid_amount numeric;
  v_new_paid_amount numeric;
  v_old_remaining numeric;
  v_new_remaining numeric;
  v_customer_total_debt numeric;
  v_customer_pending_debt numeric;
begin
  -- Validasi input
  if p_amount <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari 0' using errcode = 'P0001';
  end if;

  -- Ambil data hutang dan customer
  select cd.*, c.total_debt, c.pending_debt
    into v_debt, v_customer
    from public.customer_debts cd
    join public.customers c on c.id = cd.customer_id
    where cd.id = p_debt_id
    for update;

  if not found then
    raise exception 'Hutang tidak ditemukan' using errcode = 'P0001';
  end if;

  -- Hitung jumlah yang harus dibayar
  v_amount_to_pay := least(p_amount, v_debt.remaining_amount);

  -- Update hutang
  v_old_paid_amount := v_debt.paid_amount;
  v_new_paid_amount := v_debt.paid_amount + v_amount_to_pay;
  v_old_remaining := v_debt.remaining_amount;
  v_new_remaining := v_debt.remaining_amount - v_amount_to_pay;

  if v_new_paid_amount >= v_debt.amount then
    -- Lunasi hutang
    update public.customer_debts
      set paid_amount = v_new_paid_amount,
          remaining_amount = 0,
          status = case when v_new_remaining <= 0 then 'paid' else 'partial' end,
          updated_at = now(),
          updated_by = p_created_by
      where id = p_debt_id
      returning remaining_amount into v_new_remaining;
  else
    -- Bayar sebagian
    update public.customer_debts
      set paid_amount = v_new_paid_amount,
          remaining_amount = v_new_remaining,
          status = case when v_new_remaining <= 0 then 'paid' else 'partial' end,
          updated_at = now(),
          updated_by = p_created_by
      where id = p_debt_id;
  end if;

  -- Update customer debt totals
  v_customer_total_debt := v_customer.total_debt;
  v_customer_pending_debt := v_customer.pending_debt;

  if v_old_remaining > 0 and v_new_remaining = 0 then
    -- Kurangi hutang yang tertunda
    v_customer_pending_debt := v_customer.pending_debt - v_amount_to_pay;
    update public.customers
      set pending_debt = v_customer_pending_debt,
          updated_at = now(),
          updated_by = p_created_by
      where id = v_debt.customer_id;
  end if;

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
      'amount_paid', v_amount_to_pay,
      'old_paid_amount', v_old_paid_amount,
      'new_paid_amount', v_new_paid_amount,
      'old_remaining', v_old_remaining,
      'new_remaining', v_new_remaining,
      'new_status', status
    )
  );

  -- Return data terbaru
  -- Return data terbaru
  return jsonb_build_object(
    'debt_id', p_debt_id,
    'amount_paid', v_amount_to_pay,
    'paid_amount', v_new_paid_amount,
    'remaining_amount', v_new_remaining,
    'status', (select status from public.customer_debts where id = p_debt_id),
    'customer_total_debt', v_customer_total_debt,
    'customer_pending_debt', v_customer_pending_debt
  );
end;
$$;

-- ------------------------------------------------------------
-- Fungsi untuk mendapatkan statistik hutang customer
-- ------------------------------------------------------------
create or replace function public.fn_get_customer_debt_stats(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_total numeric := 0;
  v_pending numeric := 0;
  v_paid numeric := 0;
  v_overdue numeric := 0;
  v_total_count int := 0;
  v_pending_count int := 0;
  v_due_soon int := 0;
begin
  select
    coalesce(sum(amount), 0),
    coalesce(sum(case when status in ('pending', 'partial', 'overdue') then remaining_amount else 0 end), 0),
    coalesce(sum(case when status = 'paid' then amount else 0 end), 0),
    coalesce(sum(case when status = 'overdue' then remaining_amount else 0 end), 0),
    count(*),
    count(*) filter (where status in ('pending', 'partial', 'overdue'))
  into v_total, v_pending, v_paid, v_overdue, v_total_count, v_pending_count
  from public.customer_debts
  where customer_id = p_customer_id;

  select count(*)
    into v_due_soon
  from public.customer_debts
  where customer_id = p_customer_id
    and status in ('pending', 'partial')
    and due_date <= current_date + interval '7 days';

  return jsonb_build_object(
    'total_debt', v_total,
    'pending_debt', v_pending,
    'paid_debt', v_paid,
    'overdue_debt', v_overdue,
    'total_records', v_total_count,
    'pending_records', v_pending_count,
    'due_soon_records', v_due_soon
  );
end;
$$;

-- ------------------------------------------------------------
-- Trigger untuk update otomatis debt di customers
-- ------------------------------------------------------------

-- Trigger function: update customer debt totals ketika status hutang berubah
create or replace function public.update_customer_debt_totals()
returns trigger as $$
begin
  -- Jika status hutang diubah ke 'paid' atau 'cancelled', kurangi hutang customer
  if (TG_OP = 'UPDATE' and OLD.status <> 'paid' and NEW.status = 'paid') or
     (TG_OP = 'UPDATE' and OLD.status <> 'cancelled' and NEW.status = 'cancelled') then
    -- Kurangi total_debt dan pending_debt
    update public.customers
      set total_debt = GREATEST(total_debt - OLD.remaining_amount, 0),
          pending_debt = GREATEST(pending_debt - OLD.remaining_amount, 0),
          updated_at = now()
      where id = OLD.customer_id;
  end if;

  return NULL;
end;
$$ language plpgsql;

create trigger trg_update_customer_debt_totals
  after update on public.customer_debts
  for each row
  execute function public.update_customer_debt_totals();

-- ------------------------------------------------------------
-- Trigger function: auto-mark overdue debts
-- ------------------------------------------------------------
create or replace function public.update_debt_overdue_status()
returns trigger as $$
begin
  update public.customer_debts
    set status = 'overdue', updated_at = now()
    where status in ('pending', 'partial')
      and due_date < current_date;
  return null;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- Extra indexes
-- ------------------------------------------------------------
create index if not exists idx_customers_total_debt on public.customers (total_debt desc);
create index if not exists idx_customers_pending_debt on public.customers (pending_debt desc);
create index if not exists idx_customer_debts_created_at on public.customer_debts (created_at desc);

-- ------------------------------------------------------------
-- RLS Policies
-- ------------------------------------------------------------

-- Hanya service_role (backend) yang bisa mengakses tabel ini
create policy customer_debts_select on public.customer_debts
  for select using (public.has_permission('customers.view'));

create policy customer_debts_insert on public.customer_debts
  for insert with check (public.has_permission('customers.create'));

create policy customer_debts_update on public.customer_debts
  for update using (public.has_permission('customers.update'));

create policy customer_debts_delete on public.customer_debts
  for delete using (public.has_permission('customers.delete'));

-- ------------------------------------------------------------
-- Grant akses
-- ------------------------------------------------------------
alter table public.customer_debts enable row level security;
