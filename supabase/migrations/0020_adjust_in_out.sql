-- ============================================================
-- POS APP — 0020_adjust_in_out.sql
-- ------------------------------------------------------------
-- Pembedaan arah penyesuaian stok di pergerakan (Movements).
-- Sebelumnya ADJUSTMENT tunggal, sekarang ADJUSTMENT_IN (bertambah)
-- & ADJUSTMENT_OUT (berkurang: rusak, kadaluarsa, hilang, dll).
-- Backward-compat: ADJUSTMENT tetap diterima.
-- ============================================================

alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_type_check
    check (type in ('STOCK_IN', 'STOCK_OUT', 'SALE', 'SALE_RETURN', 'PURCHASE',
                    'ADJUSTMENT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'STOCK_OPNAME'));

-- RPC baru: signature overload dengan parameter arah & kategori alasan.
-- Untuk kompatibilitas, signature lama (tanpa arah/kategori) tetap ada.
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
  v_type        text;
begin
  -- Tolak nilai tidak valid
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

  -- Tipe pergerakan mengikuti arah delta
  v_type := case when p_quantity > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end;

  update public.products
     set stock = v_new_stock, updated_at = now(), updated_by = p_created_by
   where id = p_product_id;

  insert into public.inventory_movements
    (product_id, type, quantity, before_stock, after_stock, reference_type, notes, created_by)
  values (p_product_id, v_type, p_quantity, v_stock, v_new_stock, 'adjustment',
          coalesce(p_reason, 'Penyesuaian stok'), p_created_by);

  insert into public.audit_logs (user_id, username, action, module, record_id, new_data)
  values (p_created_by, (select username from public.users where id = p_created_by),
          'STOCK_ADJUSTED', 'inventory', p_product_id,
          jsonb_build_object('product', v_name, 'delta', p_quantity, 'before', v_stock,
                             'after', v_new_stock, 'reason', p_reason, 'direction', v_type));

  return jsonb_build_object(
    'product_id', p_product_id,
    'stock', v_new_stock,
    'delta', p_quantity,
    'type', v_type
  );
end;
$$;

grant execute on function public.fn_adjust_stock(uuid, numeric, text, uuid) to service_role;
