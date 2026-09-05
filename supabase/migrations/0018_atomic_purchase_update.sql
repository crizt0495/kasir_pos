-- ============================================================
-- POS APP — 0018_atomic_purchase_update.sql
-- Fix: update pembelian draft harus ATOMIK (header + items).
-- ============================================================

create or replace function public.fn_update_purchase(
  p_purchase_id     uuid,
  p_created_by      uuid,
  p_supplier_id     uuid,
  p_invoice_number  text,
  p_purchase_date   date,
  p_discount        numeric,
  p_notes           text,
  p_items           jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_item            jsonb;
  v_product_id      uuid;
  v_qty             numeric;
  v_cost            numeric;
  v_subtotal        numeric := 0;
  v_total           numeric;
  v_purchase_status text;
  v_purchase_number text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar produk tidak boleh kosong' using errcode = 'P0001';
  end if;

  select status, purchase_number
    into v_purchase_status, v_purchase_number
    from public.purchases where id = p_purchase_id for update;
  if v_purchase_status is null then
    raise exception 'Pembelian tidak ditemukan' using errcode = 'P0001';
  end if;
  if v_purchase_status <> 'draft' then
    raise exception 'Hanya pembelian draft yang dapat diubah' using errcode = 'P0001';
  end if;

  update public.purchases
     set supplier_id     = p_supplier_id,
         invoice_number  = p_invoice_number,
         purchase_date   = coalesce(p_purchase_date, purchase_date),
         discount        = coalesce(p_discount, 0),
         notes           = p_notes,
         updated_by      = p_created_by
   where id = p_purchase_id;

  delete from public.purchase_items where purchase_id = p_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty        := (v_item ->> 'quantity')::numeric;
    v_cost       := (v_item ->> 'cost_price')::numeric;
    if v_qty <= 0 then
      raise exception 'Qty harus lebih dari 0' using errcode = 'P0001';
    end if;
    if v_cost < 0 then
      raise exception 'Harga beli tidak boleh negatif' using errcode = 'P0001';
    end if;
    insert into public.purchase_items (purchase_id, product_id, quantity, cost_price, subtotal)
    values (p_purchase_id, v_product_id, v_qty, v_cost, v_qty * v_cost);
    v_subtotal := v_subtotal + (v_qty * v_cost);
  end loop;

  v_total := v_subtotal - coalesce(p_discount, 0);
  update public.purchases set subtotal = v_subtotal, total = v_total where id = p_purchase_id;

  return jsonb_build_object(
    'purchase_id', p_purchase_id, 'subtotal', v_subtotal,
    'discount', coalesce(p_discount, 0), 'total', v_total
  );
end;
$$;

grant execute on function public.fn_update_purchase(uuid, uuid, uuid, text, date, numeric, text, jsonb) to service_role;