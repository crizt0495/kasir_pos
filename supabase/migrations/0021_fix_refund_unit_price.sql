-- ============================================================
-- POS APP — 0021_fix_refund_unit_price.sql
-- ------------------------------------------------------------
-- Perbaiki fn_refund_sale agar harga retur konsisten dengan
-- harga yang sebenarnya dibayar customer (subtotal/qty setelah
-- diskon), bukan v_si.price mentah. Sebelumnya refund_amount
-- bisa over-state ketika item berdiskon.
-- + Validasi qty NaN/Infinity/null di awal loop.
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
    -- Tolak NaN/Infinity/null dan qty tidak valid
    if v_qty is null or v_qty = 'NaN'::numeric
       or v_qty = 'Infinity'::numeric or v_qty = '-Infinity'::numeric
       or v_qty <= 0 or v_qty > (v_si.quantity - v_si.returned_qty) then
      raise exception 'Qty retur melebihi jumlah yang dapat diretur' using errcode = 'P0001';
    end if;

    -- Harga efektif per unit setelah diskon (customer membayar subtotal/qty,
    -- bukan price). refund_amount harus konsisten dengan ini.
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

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'refund', v_refund,
    'profit_correction', v_profit_refunded,
    'sale_status', case when v_fully_refunded then 'refunded' else 'partially_refunded' end
  );
end;
$$;
