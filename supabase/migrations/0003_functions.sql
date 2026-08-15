-- ============================================================
-- POS APP — 0003_functions.sql
-- Fungsi transaksional di level database (atomic / ROLLBACK otomatis).
--
-- Alur penjualan (fn_create_sale):
--   Create Sale → Create Sale Items → Create Payment →
--   Update Inventory → Create Inventory Movement → Create Audit Log → Commit
-- Jika salah satu gagal, seluruh transaksi di-ROLLBACK.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: nilai setting
-- ------------------------------------------------------------
create or replace function public.get_setting(p_key text)
returns jsonb as $$
  select value from public.settings where key = p_key;
$$ language sql stable security definer;

-- ------------------------------------------------------------
-- CREATE SALE
-- p_items: [{"product_id": uuid, "quantity": n, "price": n, "discount": n}]
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
  v_subtotal        numeric := 0;
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

    select stock, name into v_stock, v_product_name
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

    insert into public.sale_items (sale_id, product_id, quantity, price, discount, subtotal)
    values (v_sale_id, v_product_id, v_qty, v_price, v_item_disc, (v_price * v_qty) - v_item_disc);

    insert into public.inventory_movements
      (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
    values (v_product_id, 'SALE', -v_qty, v_stock, v_stock - v_qty, v_sale_id, 'sale',
            'Penjualan ' || v_invoice, p_created_by);

    v_subtotal := v_subtotal + (v_price * v_qty) - v_item_disc;
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
         additional_cost = p_additional_cost, total = v_total
   where id = v_sale_id;

  if p_session_id is not null then
    insert into public.cash_transactions
      (session_id, type, amount, reference_type, reference_id, notes, created_by)
    values (p_session_id, 'SALE', v_total, 'sale', v_sale_id, 'Penjualan ' || v_invoice, p_created_by);
  end if;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'SALE_CREATED', 'sales', v_sale_id,
          jsonb_build_object('invoice_number', v_invoice, 'total', v_total, 'items', jsonb_array_length(p_items)));

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'tax', p_tax,
    'additional_cost', p_additional_cost,
    'total', v_total,
    'payment_method', p_payment_method,
    'cash_received', p_cash_received,
    'change', v_change
  );
end;
$$;

-- ------------------------------------------------------------
-- REFUND SALE
-- p_items: [{"sale_item_id": uuid, "quantity": n}]
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

    v_refund := v_refund + (v_si.price * v_qty);
  end loop;

  update public.returns set total_refund = v_refund where id = v_return_id;

  -- Status sale: refunded / partially_refunded
  select sum(quantity) into v_sold_total from public.sale_items where sale_id = p_sale_id;
  select coalesce(sum(ri.quantity), 0) into v_refunded_total
    from public.return_items ri join public.returns r on r.id = ri.return_id
   where r.sale_id = p_sale_id;
  v_fully_refunded := v_refunded_total >= v_sold_total;

  update public.sales
     set status = case when v_fully_refunded then 'refunded' else 'partially_refunded' end,
         updated_at = now(), updated_by = p_created_by
   where id = p_sale_id;

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
          jsonb_build_object('return_number', v_return_number, 'refund', v_refund, 'reason', p_reason));

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'refund', v_refund,
    'sale_status', case when v_fully_refunded then 'refunded' else 'partially_refunded' end
  );
end;
$$;

-- ------------------------------------------------------------
-- RECEIVE PURCHASE (stok masuk)
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
  v_number    text;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase.status in ('received', 'cancelled') then
    raise exception 'Pembelian sudah diterima atau dibatalkan' using errcode = 'P0001';
  end if;

  for v_pi in
    select pi.* from public.purchase_items pi where pi.purchase_id = p_purchase_id for update
  loop
    select stock into v_stock from public.products where id = v_pi.product_id for update;

    update public.products
       set stock = stock + v_pi.quantity, updated_at = now(), updated_by = p_created_by
     where id = v_pi.product_id;

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
          jsonb_build_object('purchase_number', v_purchase.purchase_number));

  return jsonb_build_object('purchase_id', p_purchase_id, 'status', 'received');
end;
$$;

-- ------------------------------------------------------------
-- COMPLETE STOCK OPNAME (stok sistem = stok fisik)
-- ------------------------------------------------------------
create or replace function public.fn_complete_stock_opname(
  p_opname_id     uuid,
  p_created_by    uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_opname  record;
  v_oi      record;
  v_stock   numeric;
  v_count   int := 0;
begin
  select * into v_opname from public.stock_opnames where id = p_opname_id for update;
  if v_opname.id is null then
    raise exception 'Stock opname tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_opname.status <> 'draft' then
    raise exception 'Stock opname sudah diselesaikan' using errcode = 'P0001';
  end if;

  for v_oi in
    select oi.* from public.stock_opname_items oi
    where oi.opname_id = p_opname_id
    for update
  loop
    select stock into v_stock from public.products where id = v_oi.product_id for update;

    update public.products
       set stock = v_oi.physical_stock, updated_at = now(), updated_by = p_created_by
     where id = v_oi.product_id;

    if v_oi.difference <> 0 then
      insert into public.inventory_movements
        (product_id, type, quantity, before_stock, after_stock, reference_id, reference_type, notes, created_by)
      values (v_oi.product_id, 'STOCK_OPNAME', v_oi.difference, v_stock, v_oi.physical_stock,
              p_opname_id, 'stock_opname', coalesce(v_oi.reason, 'Stock opname'), p_created_by);
      v_count := v_count + 1;
    end if;
  end loop;

  update public.stock_opnames
     set status = 'completed', updated_at = now(), updated_by = p_created_by
   where id = p_opname_id;

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'STOCK_OPNAME_COMPLETED', 'stock_opname', p_opname_id,
          jsonb_build_object('adjusted_items', v_count));

  return jsonb_build_object('opname_id', p_opname_id, 'status', 'completed', 'adjusted_items', v_count);
end;
$$;
