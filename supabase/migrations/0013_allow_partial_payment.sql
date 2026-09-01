-- ============================================================
-- POS APP — 0013_allow_partial_payment.sql
-- Izinkan cash bayar kurang saat catat hutang.
-- Tambah parameter p_allow_partial ke fn_create_sale.
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
  p_allow_partial   boolean default false
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

  if p_payment_method = 'CASH' and p_cash_received is not null and not p_allow_partial then
    v_change := p_cash_received - v_total;
    if v_change < 0 then
      raise exception 'Jumlah bayar kurang dari total transaksi' using errcode = 'P0001';
    end if;
  elsif p_payment_method = 'CASH' and p_cash_received is not null and p_allow_partial then
    v_change := p_cash_received - v_total;
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
