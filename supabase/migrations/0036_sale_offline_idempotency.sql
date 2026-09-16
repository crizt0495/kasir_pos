-- ============================================================
-- POS APP — 0036_sale_offline_idempotency.sql
-- Idempotensi sinkronisasi transaksi offline.
-- ------------------------------------------------------------
-- Masalah: saat sinkronisasi offline, respons server bisa hilang
-- (timeout / koneksi putus) setelah transaksi AKTUAL tersimpan.
-- Frontend menganggap gagal lalu mengirim offline_id yang SAMA
-- sekali lagi → transaksi TERDUPLIKASI.
--
-- Solusi:
--   1. Tambah kolom sales.offline_id (text) + unique index
--      parsial — sebuah offline_id hanya boleh menciptakan
--      SATU transaksi.
--   2. fn_create_sale versi 14-arg menerima p_offline_id.
--      - Bila offline_id sudah ada → kembalikan transaksi yang
--        sudah tersimpan (idempotent: true) tanpa membuat baru.
--      - Bila terjadi race (unique_violation) → tangkap dan
--        kembalikan hasil yang sama (bukan error).
--   3. Helper fn_sale_result_idem(uuid) merakit hasil jsonb
--      sebuah transaksi yang sudah ada (dipakai saat dedup).
-- Aman dijalankan ulang (idempoten).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kolom offline_id + unique index parsial
-- ------------------------------------------------------------
alter table public.sales add column if not exists offline_id text;
create unique index if not exists uq_sales_offline_id
  on public.sales (offline_id)
  where offline_id is not null;

-- ------------------------------------------------------------
-- 2. Helper: jsonb hasil transaksi yang SUDAH ada (idempotent)
-- ------------------------------------------------------------
create or replace function public.fn_sale_result_idem(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_existing public.sales%rowtype;
  v_cash     numeric;
  v_change   numeric;
  v_debt     jsonb;
begin
  select * into v_existing from public.sales where id = p_sale_id;
  if v_existing.id is null then
    return null;
  end if;

  select cash_received, change_amount into v_cash, v_change
    from public.sale_payments
    where sale_id = p_sale_id
    order by created_at
    limit 1;

  select jsonb_build_object(
           'debt_id', d.id,
           'debt_amount', d.amount
         )
    into v_debt
    from public.customer_debts d
    where d.sale_id = p_sale_id and d.status <> 'cancelled'
    order by d.created_at
    limit 1;

  return jsonb_build_object(
    'sale_id', v_existing.id,
    'invoice_number', v_existing.invoice_number,
    'subtotal', v_existing.subtotal,
    'discount', v_existing.discount,
    'tax', v_existing.tax,
    'additional_cost', v_existing.additional_cost,
    'total', v_existing.total,
    'total_cost', v_existing.total_cost,
    'profit', v_existing.profit,
    'payment_method', v_existing.payment_method,
    'cash_received', v_cash,
    'change', v_change,
    'debt_id', nullif(v_debt ->> 'debt_id', '')::uuid,
    'debt_amount', coalesce((v_debt ->> 'debt_amount')::numeric, 0),
    'idempotent', true
  );
end;
$$;

grant execute on function public.fn_sale_result_idem(uuid) to service_role;

-- ------------------------------------------------------------
-- 3. FN_CREATE_SALE versi 14-arg (tambah p_offline_id)
--    Versi 13-arg lama (0030) tetap ada; panggilan dari backend
--    memakai 14-arg dan otomatis fallback ke 13-arg bila migrasi
--    belum di-apply (PGRST202).
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
  p_session_id      uuid default null,
  p_allow_partial   boolean default false,
  p_record_debt     jsonb default null,
  p_offline_id      text default null
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

  -- Idempotensi offline: offline_id sama → kembalikan transaksi yang
  -- sudah pernah dibuat (tidak membuat duplikat).
  if p_offline_id is not null then
    select id into v_sale_id from public.sales
      where offline_id = p_offline_id
      limit 1;
    if v_sale_id is not null then
      return public.fn_sale_result_idem(v_sale_id);
    end if;
  end if;

  begin
    select coalesce((value ->> 'allow_negative_stock')::boolean, false)
      into v_allow_negative from public.settings where key = 'inventory';
    select coalesce(value ->> 'prefix', 'INV') into v_prefix
      from public.settings where key = 'invoice';

    perform pg_advisory_xact_lock(hashtext('sale_counter'));
    insert into public.sale_counters (day, seq) values (current_date, 1)
      on conflict (day) do update set seq = public.sale_counters.seq + 1
      returning seq into v_counter;
    v_invoice := v_prefix || '-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 6, '0');

    insert into public.sales (invoice_number, customer_id, cashier_id, payment_method, status, notes, offline_id, created_by, updated_by)
      values (v_invoice, p_customer_id, p_cashier_id, p_payment_method, 'completed', p_notes, p_offline_id, p_created_by, p_created_by)
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
      'debt_amount', v_debt_amount,
      'idempotent', false
    );
  exception
    when unique_violation then
      -- Race: dua permintaan dengan offline_id sama tiba bersamaan.
      -- Permintaan yang kalah rollback otomatis → kembalikan hasil si pemenang.
      if p_offline_id is not null then
        select id into v_sale_id from public.sales
          where offline_id = p_offline_id
          limit 1;
        if v_sale_id is not null then
          return public.fn_sale_result_idem(v_sale_id);
        end if;
      end if;
      raise;
  end;
end;
$$;

grant execute on function public.fn_create_sale(uuid, uuid, jsonb, uuid, numeric, numeric, numeric, text, numeric, text, uuid, boolean, jsonb, text) to service_role;