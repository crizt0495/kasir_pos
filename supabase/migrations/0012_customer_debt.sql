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
-- Tambah kolom debt di customers (idempoten)
-- ------------------------------------------------------------
alter table public.customers
  add column if not exists total_debt numeric(15,2) not null default 0,
  add column if not exists pending_debt numeric(15,2) not null default 0;

-- ------------------------------------------------------------
-- Buat tabel customer_debts (idempoten)
-- ------------------------------------------------------------
create table if not exists public.customer_debts (
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
create index if not exists idx_customer_debts_customer on public.customer_debts (customer_id);
create index if not exists idx_customer_debts_status on public.customer_debts (status);
create index if not exists idx_customer_debts_due_date on public.customer_debts (due_date);

-- ------------------------------------------------------------
-- Fungsi transaksi untuk mencatat hutang baru
-- ------------------------------------------------------------
create or replace function public.fn_record_debt(
  p_customer_id    uuid,
  p_amount        numeric,
  p_due_date      date,
  p_notes         text,
  p_created_by    uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_customer record;
  v_debt_id        uuid;
  v_total_debt     numeric := 0;
  v_pending_debt   numeric := 0;
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
  v_customer_id uuid;
  v_amount numeric;
  v_paid_amount numeric;
  v_remaining numeric;
  v_amount_to_pay numeric;
  v_old_remaining numeric;
  v_new_remaining numeric;
  v_customer_pending_debt numeric;
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
      'new_remaining', v_new_remaining,
      'new_status', case when v_new_remaining <= 0 then 'paid' else 'partial' end
    )
  );

  return jsonb_build_object(
    'debt_id', p_debt_id,
    'amount_paid', v_amount_to_pay,
    'paid_amount', v_paid_amount + v_amount_to_pay,
    'remaining_amount', v_new_remaining,
    'status', case when v_new_remaining <= 0 then 'paid' else 'partial' end
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

drop trigger if exists trg_update_customer_debt_totals on public.customer_debts;
create trigger trg_update_customer_debt_totals
  after update on public.customer_debts
  for each row
  execute function public.update_customer_debt_totals();

-- ------------------------------------------------------------
-- Trigger function: auto-mark overdue debts
-- Dipicu saat insert & update untuk menandai lewat jatuh tempo.
-- ------------------------------------------------------------
create or replace function public.update_debt_overdue_status()
returns trigger as $$
begin
  if NEW.status in ('pending', 'partial') and NEW.due_date < current_date then
    NEW.status := 'overdue';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_debt_overdue_before on public.customer_debts;
create trigger trg_debt_overdue_before
  before insert or update on public.customer_debts
  for each row
  execute function public.update_debt_overdue_status();

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
drop policy if exists customer_debts_select on public.customer_debts;
create policy customer_debts_select on public.customer_debts
  for select using (public.has_permission('customers.view'));

drop policy if exists customer_debts_insert on public.customer_debts;
create policy customer_debts_insert on public.customer_debts
  for insert with check (public.has_permission('customers.create'));

drop policy if exists customer_debts_update on public.customer_debts;
create policy customer_debts_update on public.customer_debts
  for update using (public.has_permission('customers.update'));

drop policy if exists customer_debts_delete on public.customer_debts;
create policy customer_debts_delete on public.customer_debts
  for delete using (public.has_permission('customers.delete'));

-- ------------------------------------------------------------
-- Grant akses
-- ------------------------------------------------------------
alter table public.customer_debts enable row level security;
