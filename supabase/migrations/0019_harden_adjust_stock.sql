-- ============================================================
-- POS APP — 0019_harden_adjust_stock.sql
-- ------------------------------------------------------------
-- Perkuat fn_adjust_stock agar menolak nilai tidak valid yang
-- dapat merusak stok produk:
--   - NULL
--   - NaN / Infinity / -Infinity (numeric Postgres mengizinkan ini)
--   - 0 (tidak ada perubahan — tidak menulis movement kosong)
-- ============================================================

create or replace function public.fn_adjust_stock(
  p_product_id   uuid,
  p_quantity     numeric,
  p_reason       text,
  p_created_by   uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_stock       numeric;
  v_new_stock   numeric;
  v_allow_neg   boolean;
  v_name        text;
begin
  -- Tolak nilai tidak valid (NaN/Infinity/±Infinity/0/null)
  if p_quantity is null
     or p_quantity = 'NaN'::numeric
     or p_quantity = 'Infinity'::numeric
     or p_quantity = '-Infinity'::numeric
     or p_quantity = 0 then
    raise exception 'Jumlah penyesuaian stok tidak valid' using errcode = 'P0001';
  end if;

  select coalesce((value ->> 'allow_negative_stock')::boolean, false)
    into v_allow_neg from public.settings where key = 'inventory';

  select stock, name into v_stock, v_name
    from public.products where id = p_product_id for update;

  if v_name is null then
    raise exception 'Produk tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_stock is null or v_stock = 'NaN'::numeric then
    raise exception 'Stok produk dalam kondisi tidak valid, hubungi administrator' using errcode = 'P0001';
  end if;

  v_new_stock := v_stock + p_quantity;
  if v_new_stock < 0 and not v_allow_neg then
    raise exception 'Stok tidak boleh negatif' using errcode = 'P0001';
  end if;

  update public.products
     set stock = v_new_stock, updated_at = now(), updated_by = p_created_by
   where id = p_product_id;

  insert into public.inventory_movements
    (product_id, type, quantity, before_stock, after_stock, reference_type, notes, created_by)
  values (p_product_id, 'ADJUSTMENT', p_quantity, v_stock, v_new_stock, 'adjustment',
          coalesce(p_reason, 'Penyesuaian stok'), p_created_by);

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'STOCK_ADJUSTED', 'inventory', p_product_id,
          jsonb_build_object('product', v_name, 'delta', p_quantity, 'before', v_stock, 'after', v_new_stock, 'reason', p_reason));

  return jsonb_build_object('product_id', p_product_id, 'stock', v_new_stock, 'delta', p_quantity);
end;
$$;

grant execute on function public.fn_adjust_stock(uuid, numeric, text, uuid) to service_role;