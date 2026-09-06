-- ============================================================
-- POS APP — 0030_fix_debt_stale_pending.sql
-- ------------------------------------------------------------
-- Fix: pending_debt pelanggan STALE setelah partial payment.
--
-- MASALAH:
--   fn_pay_debt (0014) hanya mengurangi customers.pending_debt
--   saat debt LUNAS (remaining = 0). Untuk partial payment,
--   pending_debt TIDAK di-update — menyebabkan halaman
--   pelanggan menampilkan nominal piutang yang SALAH (terlalu besar).
--
-- PENYEBAB LAIN:
--   fn_adjust_debt_on_refund (0022) secara manual mengurangi
--   customers.pending_debt & total_debt. Dengan trigger yang
--   tidak menghitung 'paid' (0015), tidak ada double-subtract.
--   Tapi lebih baik konsisten: SEMUA perubahan customer_debts
--   ditangani oleh trigger recalculate.
--
-- PERBAIKAN:
--   1. PASTIKAN kolom sale_id ada di customer_debts (bug 0013/0014:
--      fn_create_sale meng-INSERT kolom sale_id tapi 0012 belum
--      mendefinisikannya — produksi sudah menjalankan ALTER manual).
--   2. Trigger trg_update_customer_debt_totals dirombak total —
--      FIRE on every INSERT/UPDATE/DELETE of customer_debts.
--      Recomputes customers.total_debt & pending_debt dari data
--      aktual customer_debts. Ini single-source-of-truth.
--   3. fn_pay_debt — HAPUS manual update pending_debt.
--      Trigger sudah handle. Recompute by doing nothing (trigger
--      fires from UPDATE statement inside function).
--   4. fn_record_debt — HAPUS manual update.
--      Trigger handle via AFTER INSERT.
--   5. fn_create_sale — HAPUS manual update.
--   6. fn_cancel_debt — SUDAH BENAR (trigger handle cancelled).
--   7. fn_adjust_debt_on_refund — HAPUS manual recompute.
--   8. Reconciliation: perbaiki data yang sudah salah.
--
-- SEMANTIK:
--   total_debt   = SUM(amount) WHERE status != 'cancelled'  (lunas ikut dihitung)
--   pending_debt = SUM(remaining_amount) WHERE status IN (pending,partial,overdue)
-- ============================================================

-- ============================================================
-- 0. PASTIKAN KOLOM sale_id ADA di customer_debts
--    (fn_create_sale 0013/0014 mengisi kolom ini, namun 0012
--     tidak mendefinisikannya. Produksi sudah jalan dengan alter
--     manual — baris ini idempoten untuk proteksi install baru.)
-- ============================================================

alter table public.customer_debts
  add column if not exists sale_id uuid references public.sales(id) on delete set null;

create index if not exists idx_customer_debts_sale on public.customer_debts (sale_id);

-- ============================================================
-- 1. TRIGGER — recompute customer debt dari data aktual
--    on every INSERT / UPDATE / DELETE of customer_debts
-- ============================================================

create or replace function public.update_customer_debt_totals()
returns trigger as $$
declare
  v_customer_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_customer_id := OLD.customer_id;
  else
    v_customer_id := NEW.customer_id;
  end if;

  update public.customers
    set total_debt   = coalesce((
          select sum(d.amount) filter (where d.status <> 'cancelled')
            from public.customer_debts d
           where d.customer_id = v_customer_id
        ), 0),
        pending_debt = coalesce((
          select sum(d.remaining_amount) filter (where d.status in ('pending','partial','overdue'))
            from public.customer_debts d
           where d.customer_id = v_customer_id
        ), 0),
        updated_at   = now()
  where id = v_customer_id;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_update_customer_debt_totals on public.customer_debts;
create trigger trg_update_customer_debt_totals
  after insert or update or delete on public.customer_debts
  for each row
  execute function public.update_customer_debt_totals();

-- ============================================================
-- 2. FN_PAY_DEBT — fix: HAPUS manual pending_debt update
--    Trigger sudah handle recompute dari UPDATE statement di bawah
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
  v_customer_id    uuid;
  v_amount         numeric;
  v_paid_amount    numeric;
  v_old_remaining  numeric;
  v_amount_to_pay  numeric;
  v_new_remaining  numeric;
  v_payment_id     uuid;
begin
  if p_amount <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari 0' using errcode = 'P0001';
  end if;

  select customer_id, amount, paid_amount, remaining_amount
    into v_customer_id, v_amount, v_paid_amount, v_old_remaining
    from public.customer_debts
    where id = p_debt_id
    for update;

  if not found then
    raise exception 'Hutang tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_old_remaining <= 0 then
    raise exception 'Hutang sudah lunas' using errcode = 'P0001';
  end if;

  v_amount_to_pay := least(p_amount, v_old_remaining);
  v_new_remaining := v_old_remaining - v_amount_to_pay;

  update public.customer_debts
    set paid_amount     = paid_amount + v_amount_to_pay,
        remaining_amount = v_new_remaining,
        status          = case when v_new_remaining <= 0 then 'paid' else 'partial' end,
        updated_at      = now(),
        updated_by      = p_created_by
    where id = p_debt_id;

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
-- 3. FN_RECORD_DEBT — HAPUS manual update customers
--    Trigger handle via AFTER INSERT
-- ============================================================

create or replace function public.fn_record_debt(
  p_customer_id uuid,
  p_amount      numeric,
  p_due_date    date,
  p_notes       text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_debt_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Jumlah hutang harus lebih dari 0' using errcode = 'P0001';
  end if;

  insert into public.customer_debts (
    customer_id, amount, paid_amount, remaining_amount,
    due_date, status, notes, created_by, updated_by
  ) values (
    p_customer_id, p_amount, 0, p_amount,
    p_due_date, 'pending', p_notes, p_created_by, p_created_by
  ) returning id into v_debt_id;

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

-- ============================================================
-- 4. FN_CREATE_SALE — HAPUS manual update customers.total_debt
--    & pending_debt. Trigger handle via AFTER INSERT (debt row).
--    NOTE: hanya bagian yang menyentuh customer_debts & customers
--    yang diubah. Fungsi ini cukup panjang, jadi kita recreate
--    hanya bagian debt-related.
-- ============================================================
-- fn_create_sale dipecah jadi:
--   a) INSERT debt row (di akhir fungsi) — trigger handle customers
--   b) Hapus UPDATE customers manual
--
-- Versi lengkap fn_create_sale (dari 0014):
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
  v_due_date        date;
  v_debt_notes      text;
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

    v_due_date := current_date + interval '30 days';
    v_debt_notes := null;
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

    -- Trigger trg_update_customer_debt_totals fire AFTER INSERT
    -- dan recompute customers.total_debt & pending_debt secara otomatis.
    v_debt_recorded := true;
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
-- 5. FN_ADJUST_DEBT_ON_REFUND — HAPUS manual customer update
--    Trigger handle via AFTER UPDATE of customer_debts row.
--    NOTE: hanya bagian debt-related, bukan fn_refund_sale lengkap.
-- ============================================================

create or replace function public.fn_adjust_debt_on_refund(
  p_sale_id        uuid,
  p_refund_amount  numeric,
  p_created_by     uuid,
  p_return_id      uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_debt              record;
  v_sale              record;
  v_refund_remaining  numeric;
  v_excess_paid      numeric;
  v_new_remaining    numeric;
  v_new_paid         numeric;
  v_new_amount       numeric;
  v_new_status       text;
  v_old_amount       numeric;
  v_old_remaining    numeric;
  v_old_paid         numeric;
begin
  -- Cari hutang aktif terkait transaksi ini
  select d.* into v_debt
    from public.customer_debts d
    where d.sale_id = p_sale_id
      and d.status != 'cancelled'
    order by case when d.status = 'paid' then 1 else 0 end
    for update;

  if v_debt.id is null then
    return jsonb_build_object(
      'adjusted', false,
      'reason', 'no_active_debt'
    );
  end if;

  select * into v_sale from public.sales where id = p_sale_id;

  v_old_amount := v_debt.amount;
  v_old_remaining := v_debt.remaining_amount;
  v_old_paid := v_debt.paid_amount;

  -- SEMANTIK: refund mengurangi sisa hutang (remaining) terlebih
  -- dahulu; jika refund MELEBIHI sisa, kelebihannya mengurangi
  -- nominal yang sudah dibayar (paid_amount) — cash refund ke pelanggan.
  v_refund_remaining := least(p_refund_amount, greatest(coalesce(v_debt.remaining_amount, 0), 0));
  v_excess_paid    := greatest(p_refund_amount - v_refund_remaining, 0);
  v_excess_paid    := least(v_excess_paid, greatest(coalesce(v_debt.paid_amount, 0), 0));

  v_new_remaining := round(coalesce(v_debt.remaining_amount, 0) - v_refund_remaining, 2);
  v_new_paid     := round(coalesce(v_debt.paid_amount, 0) - v_excess_paid, 2);
  v_new_remaining := greatest(v_new_remaining, 0);
  v_new_paid     := greatest(v_new_paid, 0);
  v_new_amount   := round(v_new_paid + v_new_remaining, 2);

  if v_new_remaining <= 0 then
    v_new_status := 'paid';
    v_new_remaining := 0;
  elsif v_new_paid > 0 then
    v_new_status := 'partial';
  else
    v_new_status := 'pending';
  end if;

  update public.customer_debts
    set amount           = v_new_amount,
        paid_amount      = v_new_paid,
        remaining_amount = v_new_remaining,
        status           = v_new_status,
        notes            = coalesce(notes, '') || E'\n[RETUR ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' ||
                           'Retur ' || coalesce(v_sale.invoice_number, '(' || p_sale_id::text || ')') ||
                           ' — refund ' || round(p_refund_amount, 2) ||
                           case when v_refund_remaining > 0 then ' — kurangi sisa ' || round(v_refund_remaining, 2) else '' end ||
                           case when v_excess_paid > 0 then ' — kurangi bayar ' || round(v_excess_paid, 2) else '' end,
        updated_at       = now(),
        updated_by       = p_created_by
    where id = v_debt.id;
  -- Trigger trg_update_customer_debt_totals fire AFTER UPDATE
  -- dan recompute customers.total_debt & pending_debt secara otomatis.

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (
    p_created_by,
    (select username from public.users where id = p_created_by),
    'DEBT_REDUCED_BY_RETURN',
    'customer_debts',
    v_debt.id,
    jsonb_build_object(
      'debt_id', v_debt.id,
      'sale_id', p_sale_id,
      'return_id', p_return_id,
      'refund_amount', p_refund_amount,
      'refund_remaining', v_refund_remaining,
      'excess_paid', v_excess_paid,
      'old_amount', v_old_amount,
      'new_amount', v_new_amount,
      'old_remaining', v_old_remaining,
      'new_remaining', v_new_remaining,
      'old_paid', v_old_paid,
      'new_paid', v_new_paid,
      'new_status', v_new_status
    )
  );

  return jsonb_build_object(
    'adjusted', true,
    'debt_id', v_debt.id,
    'refund_amount', p_refund_amount,
    'refund_remaining', v_refund_remaining,
    'excess_paid', v_excess_paid,
    'old_amount', v_old_amount,
    'new_amount', v_new_amount,
    'old_remaining', v_old_remaining,
    'new_remaining', v_new_remaining,
    'old_paid', v_old_paid,
    'new_paid', v_new_paid,
    'new_status', v_new_status
  );
end;
$$;

-- ============================================================
-- 6. FN_CANCEL_DEBT — SUDAH BENAR (trigger handle 'cancelled')
--    Tidak ada perubahan — trigger fire via AFTER UPDATE.
-- ============================================================

-- ============================================================
-- 7. GRANTS
-- ============================================================

grant execute on function public.fn_pay_debt(uuid, numeric, uuid, text, text) to service_role;
grant execute on function public.fn_record_debt(uuid, numeric, date, text, uuid) to service_role;
grant execute on function public.fn_create_sale(uuid, uuid, jsonb, uuid, numeric, numeric, numeric, text, numeric, text, uuid, boolean, jsonb) to service_role;
grant execute on function public.fn_adjust_debt_on_refund(uuid, numeric, uuid, uuid) to service_role;

-- ============================================================
-- 8. REKONSILIASI — perbaiki data yang sudah salah
--    akibat bug double-subtract di fn_pay_debt (0014) dan
--    partial payment (pending_debt tidak pernah turun).
-- ============================================================

update public.customers c
  set total_debt   = coalesce(agg.total_debt, 0),
      pending_debt = coalesce(agg.pending_debt, 0),
      updated_at   = now()
from (
  select
    customer_id,
    coalesce(sum(amount) filter (where status <> 'cancelled'), 0) as total_debt,
    coalesce(sum(remaining_amount) filter (where status in ('pending', 'partial', 'overdue')), 0) as pending_debt
  from public.customer_debts
  group by customer_id
) agg
where agg.customer_id = c.id;
