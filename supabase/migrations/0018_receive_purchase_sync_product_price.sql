-- ============================================================
-- FIX fn_receive_purchase: sinkronkan harga beli produk
-- ============================================================
-- Bug: saat pembelian diterima, stock produk bertambah tetapi
--      products.purchase_price tidak diperbarui mengikuti harga
--      beli terbaru di purchase_items.cost_price, sehingga
--      halaman Produk tetap menampilkan harga beli lama.
-- Solusi: update purchase_price = cost_price item pembelian.
--         Nilai 0/negatif diabaikan agar harga beli produk tidak
--         ter-reset ke 0 jika pembelian dibuat tanpa harga.

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
       set stock = stock + v_pi.quantity,
           purchase_price = case
             when v_pi.cost_price > 0 then v_pi.cost_price
             else purchase_price
           end,
           updated_at = now(),
           updated_by = p_created_by
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

grant execute on function public.fn_receive_purchase(uuid, uuid) to service_role;