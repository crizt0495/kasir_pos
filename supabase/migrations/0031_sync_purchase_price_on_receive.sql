-- ============================================================
-- POS APP — 0031_sync_purchase_price_on_receive.sql
-- Saat pembelian diterima, harga beli (purchase_price) produk
-- otomatis diperbarui mengikuti harga beli terbaru dari item
-- pembelian. Ini menjaga konsistensi HPP dan perhitungan laba.
-- ============================================================

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
  v_updated   int := 0;
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
       set stock          = stock + v_pi.quantity,
           purchase_price = v_pi.cost_price,
           updated_at     = now(),
           updated_by     = p_created_by
     where id = v_pi.product_id;
    v_updated := v_updated + 1;

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
          jsonb_build_object(
            'purchase_number', v_purchase.purchase_number,
            'items_updated', v_updated
          ));

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'status', 'received',
    'items_updated', v_updated
  );
end;
$$;
