-- ============================================================
-- POS APP — 0022_refund_reduces_debt.sql
-- ------------------------------------------------------------
-- Bug: ketika barang diretur, hutang customer TIDAK dikurangi.
-- Skenario:
--   1. Pelanggan punya hutang (sale tercatat di customer_debts.sale_id)
--   2. Barang direktur sebagian/seluruhnya
--   3. Debt tetap nominal awal — customer masih harus bayar utangnya
--
-- Perbaikan:
--   1. fn_adjust_debt_on_refund() — helper yang mengurangi
--      remaining_amount & amount di customer_debts secara proporsional
--   2. fn_refund_sale() di-recreate, memanggil helper tsb.
--   3. fn_pay_debt() di-tweak agar tidak bentrok kalau customer
--      bayar lunas duluan, lalu barang baru diretur (refund > paid).
--
-- SEMANTIK:
--   - customer_debts.amount       = nilai awal hutang (dikurangi retur)
--   - customer_debts.remaining_amount = sisa yg belum dibayar
--   - customer_debts.paid_amount    = sudah dibayar (dikurangi refund)
--   - customers.pending_debt = sum remaining_amount (akurat)
--   - customers.total_debt    = sum amount aktif (hutang belum lunas)
-- ============================================================

-- ============================================================
-- 1. FN_ADJUST_DEBT_ON_REFUND — kurangi hutang saat retur
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
  v_excess_paid       numeric;
  v_new_remaining     numeric;
  v_new_paid          numeric;
  v_new_amount        numeric;
  v_new_status        text;
  v_new_pending       numeric;
  v_new_total         numeric;
begin
  -- Cari hutang aktif terkait transaksi ini. Status 'paid' TIDAK
  -- termasuk, tapi bisa juga terjadi customer melunasi DI LUAR alur
  -- (fn_pay_debt) lalu barang diretur — kasus ini ditangani di bawah.
  select d.* into v_debt
    from public.customer_debts d
    where d.sale_id = p_sale_id
      and d.status != 'cancelled'
    order by case when d.status = 'paid' then 1 else 0 end
    for update;

  -- Tidak ada catatan hutang — tidak ada yang perlu disesuaikan
  if v_debt.id is null then
    return jsonb_build_object(
      'adjusted', false,
      'reason', 'no_active_debt'
    );
  end if;

  -- Ambil data sale untuk catatan notes
  select * into v_sale from public.sales where id = p_sale_id;

  -- SEMANTIK: refund mengurangi sisa hutang (remaining) terlebih
  -- dahulu; jika refund MELEBIHI sisa, kelebihannya mengurangi
  -- nominal yang sudah dibayar (paid_amount) — artinya sebagian
  -- refund dikembalikan tunai ke pelanggan.
  v_refund_remaining := least(p_refund_amount, greatest(coalesce(v_debt.remaining_amount, 0), 0));
  v_excess_paid      := greatest(p_refund_amount - v_refund_remaining, 0);
  v_excess_paid      := least(v_excess_paid, greatest(coalesce(v_debt.paid_amount, 0), 0));

  v_new_remaining := round(coalesce(v_debt.remaining_amount, 0) - v_refund_remaining, 2);
  v_new_paid      := round(coalesce(v_debt.paid_amount, 0) - v_excess_paid, 2);
  v_new_remaining := greatest(v_new_remaining, 0);
  v_new_paid      := greatest(v_new_paid, 0);
  v_new_amount    := round(v_new_paid + v_new_remaining, 2);

  if v_new_remaining <= 0 then
    v_new_status := 'paid';
    v_new_remaining := 0;
  elsif v_new_paid > 0 then
    v_new_status := 'partial';
  else
    v_new_status := 'pending';
  end if;

  -- Update customer_debts
  update public.customer_debts
     set amount           = v_new_amount,
         paid_amount      = v_new_paid,
         remaining_amount = v_new_remaining,
         status           = v_new_status,
         notes            = coalesce(notes, '') || E'\n[RETUR ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' ||
                            'Retur ' || case when v_sale.invoice_number is not null then '(' || v_sale.invoice_number || ') ' else '' end ||
                            'refund ' || round(p_refund_amount, 2) ||
                            case when v_refund_remaining > 0 then ' — kurangi sisa ' || round(v_refund_remaining, 2) else '' end ||
                            case when v_excess_paid > 0 then ' — kurangi bayar ' || round(v_excess_paid, 2) else '' end,
         updated_at       = now(),
         updated_by       = p_created_by
   where id = v_debt.id;

  -- Rekomputasi pending_debt & total_debt dari data aktual
  -- (aman dari bug double-subtract dan trigger).
  select
    coalesce(sum(remaining_amount) filter (where status in ('pending', 'partial', 'overdue')), 0),
    coalesce(sum(amount) filter (where status != 'cancelled'), 0)
  into v_new_pending, v_new_total
  from public.customer_debts
  where customer_id = v_debt.customer_id;

  update public.customers
     set pending_debt = v_new_pending,
         total_debt   = v_new_total,
         updated_at   = now(),
         updated_by   = p_created_by
   where id = v_debt.customer_id;

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
      'old_amount', v_debt.amount,
      'new_amount', v_new_amount,
      'old_remaining', v_debt.remaining_amount,
      'new_remaining', v_new_remaining,
      'old_paid', v_debt.paid_amount,
      'new_paid', v_new_paid,
      'new_status', v_new_status,
      'customer_pending', v_new_pending,
      'customer_total', v_new_total
    )
  );

  return jsonb_build_object(
    'adjusted', true,
    'debt_id', v_debt.id,
    'refund_amount', p_refund_amount,
    'refund_remaining', v_refund_remaining,
    'excess_paid', v_excess_paid,
    'old_amount', v_debt.amount,
    'new_amount', v_new_amount,
    'old_remaining', v_debt.remaining_amount,
    'new_remaining', v_new_remaining,
    'old_paid', v_debt.paid_amount,
    'new_paid', v_new_paid,
    'new_status', v_new_status,
    'customer_pending', v_new_pending,
    'customer_total', v_new_total
  );
end;
$$;

grant execute on function public.fn_adjust_debt_on_refund(uuid, numeric, uuid, uuid) to service_role;

-- ============================================================
-- 2. FN_PAY_DEBT — tweak agar toleran terhadap excess refund
--    yang sudah dikurangi di fn_adjust_debt_on_refund
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
      set pending_debt = greatest(coalesce(pending_debt, 0) - v_amount_to_pay, 0),
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
-- 3. FN_REFUND_SALE — recreate dengan pemanggilan
--    fn_adjust_debt_on_refund
-- ============================================================

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
  v_unit_price      numeric;
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
  v_debt_adjust     jsonb;
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
    if v_qty is null or v_qty = 'NaN'::numeric
       or v_qty = 'Infinity'::numeric or v_qty = '-Infinity'::numeric
       or v_qty <= 0 or v_qty > (v_si.quantity - v_si.returned_qty) then
      raise exception 'Qty retur melebihi jumlah yang dapat diretur' using errcode = 'P0001';
    end if;

    if coalesce(v_si.quantity, 0) > 0 then
      v_unit_price := round((v_si.subtotal / v_si.quantity)::numeric, 2);
    else
      v_unit_price := v_si.price;
    end if;

    select stock into v_stock from public.products where id = v_si.product_id for update;

    update public.products
       set stock = stock + v_qty, updated_at = now(), updated_by = p_created_by
     where id = v_si.product_id;

    insert into public.return_items
      (return_id, sale_item_id, product_id, quantity, price, refund_amount)
    values (v_return_id, v_si.id, v_si.product_id, v_qty, v_unit_price, v_qty * v_unit_price);

    insert into public.inventory_movements
      (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
    values (v_si.product_id, 'SALE_RETURN', v_qty, v_stock, v_stock + v_qty, v_return_id, 'return',
            'Retur ' || v_return_number, p_created_by);

    v_refund          := v_refund + (v_qty * v_unit_price);
    v_profit_refunded := v_profit_refunded + (coalesce(v_si.profit, 0) * (v_qty / v_si.quantity));
  end loop;

  update public.returns set total_refund = v_refund where id = v_return_id;

  -- Rekalkulasi total_cost & profit sale dari sisa qty
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

  select sum(quantity) into v_sold_total from public.sale_items where sale_id = p_sale_id;
  select coalesce(sum(ri.quantity), 0) into v_refunded_total
    from public.return_items ri join public.returns r on r.id = ri.return_id
   where r.sale_id = p_sale_id;
  v_fully_refunded := v_refunded_total >= v_sold_total;

  if v_fully_refunded then
    update public.sales set status = 'refunded', updated_at = now(), updated_by = p_created_by
     where id = p_sale_id;
  end if;

  perform public.fn_upsert_profit_share(v_sale.customer_id, current_date, -v_refund, -v_profit_refunded);

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

  -- Sesuaikan hutang customer jika ada
  v_debt_adjust := public.fn_adjust_debt_on_refund(p_sale_id, v_refund, p_created_by, v_return_id);

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'refund', v_refund,
    'profit_correction', v_profit_refunded,
    'sale_status', case when v_fully_refunded then 'refunded' else 'partially_refunded' end,
    'debt_adjustment', v_debt_adjust
  );
end;
$$;

grant execute on function public.fn_refund_sale(uuid, uuid, jsonb, text, uuid) to service_role;
