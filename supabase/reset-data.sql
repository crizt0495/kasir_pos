-- ============================================================
-- POS APP — reset-data.sql
-- HAPUS SEMUA DATA (transaksi uji, produk, pelanggan, dsb) lalu
-- SEED ULANG data default. STRUKTUR TABEL TIDAK DISENTUH.
-- Akun (admin/kasir), role, permission TIDAK dihapus.
-- Aman dijalankan kapan saja — bisa dijalankan ulang (idempoten).
-- ============================================================

begin;

-- Hapus semua data aplikasi (cascade menangani foreign key)
truncate table
  public.audit_logs,
  public.cash_transactions,
  public.cash_sessions,
  public.expenses,
  public.return_items,
  public.returns,
  public.sale_payments,
  public.sale_items,
  public.sales,
  public.purchase_items,
  public.purchases,
  public.stock_opname_items,
  public.stock_opnames,
  public.inventory_movements,
  public.products,
  public.categories,
  public.product_units,
  public.suppliers,
  public.customers,
  public.notification_logs,
  public.notification_subscriptions,
  public.profit_distributions,
  public.customer_profit_shares,
  public.profit_periods,
  public.settings,
  public.sale_counters,
  public.return_counters,
  public.purchase_counters
cascade;

-- ============================================================
-- SEED ULANG (data default — sama dengan seed.sql)
-- ============================================================

-- Pelanggan default "Pelanggan Umum" (tidak masuk bagi hasil 2,5%)
insert into public.customers (name, is_general, notes)
select 'Pelanggan Umum', true, 'Pelanggan default untuk transaksi tanpa identitas'
where not exists (select 1 from public.customers where name = 'Pelanggan Umum');

-- Periode bagi hasil tahun berjalan
insert into public.profit_periods (year, start_date, end_date, status)
select extract(year from current_date)::int, make_date(extract(year from current_date)::int, 1, 1),
       make_date(extract(year from current_date)::int, 12, 31), 'open'
where not exists (select 1 from public.profit_periods
                  where year = extract(year from current_date)::int);

-- Kategori
insert into public.categories (name, description, status) values
  ('Makanan',    'Makanan & cemilan',        'active'),
  ('Minuman',    'Minuman ringan & kemasan', 'active'),
  ('Sembako',    'Sembilan bahan pokok',     'active'),
  ('Elektronik', 'Perangkat elektronik',     'active'),
  ('Lainnya',    'Kategori lainnya',         'active')
on conflict (name) do nothing;

-- Satuan produk
insert into public.product_units (name, short_name) values
  ('Pcs', 'pcs'),
  ('Kilogram', 'kg'),
  ('Box', 'box'),
  ('Pack', 'pack'),
  ('Liter', 'L')
on conflict do nothing;

-- Produk sample
insert into public.products (sku, barcode, name, category_id, unit_id, purchase_price, sale_price, stock, min_stock, status, description) values
  ('BRG-0001', '8991001000001', 'Kopi Kapal Api 200gr',   (select id from public.categories where name = 'Sembako'),  (select id from public.product_units where short_name = 'pcs'), 12000, 15000, 50, 10, 'active', 'Kopi bubuk kemasan 200 gram'),
  ('BRG-0002', '8991001000002', 'Indomie Goreng',         (select id from public.categories where name = 'Makanan'),  (select id from public.product_units where short_name = 'pcs'), 2500, 3500, 120, 20, 'active', 'Mie instan goreng'),
  ('BRG-0003', '8991001000003', 'Air Mineral 600ml',      (select id from public.categories where name = 'Minuman'),  (select id from public.product_units where short_name = 'pcs'), 2500, 4000, 80, 15, 'active', 'Air mineral kemasan 600 ml'),
  ('BRG-0004', '8991001000004', 'Beras Premium 5kg',      (select id from public.categories where name = 'Sembako'),  (select id from public.product_units where short_name = 'pcs'), 65000, 72000, 30, 5, 'active', 'Beras premium kemasan 5 kg'),
  ('BRG-0005', '8991001000005', 'Teh Botol Sosro 350ml',  (select id from public.categories where name = 'Minuman'),  (select id from public.product_units where short_name = 'pcs'), 3000, 5000, 0, 10, 'active', 'Teh botol siap minum'),
  ('BRG-0006', '8991001000006', 'Charger USB Type-C',     (select id from public.categories where name = 'Elektronik'),(select id from public.product_units where short_name = 'pcs'), 15000, 25000, 15, 5, 'active', 'Charger kabel USB Type-C')
on conflict (sku) do nothing;

-- Settings default
insert into public.settings (key, value) values
  ('store', jsonb_build_object(
    'name', 'Toko Sumber Rejeki',
    'address', 'Jl. Merdeka No. 12, Jakarta',
    'phone', '021-555-1234',
    'logo_url', '',
    'npwp', ''
  )),
  ('pos', jsonb_build_object(
    'default_payment_method', 'CASH',
    'auto_print_receipt', true,
    'receipt_width', '58mm'
  )),
  ('invoice', jsonb_build_object('prefix', 'INV')),
  ('tax', jsonb_build_object('enabled', false, 'percentage', 11)),
  ('inventory', jsonb_build_object('allow_negative_stock', false, 'low_stock_threshold', 10)),
  ('user_session', jsonb_build_object('session_timeout_minutes', 480)),
  ('payment_methods', jsonb_build_array('CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'))
on conflict (key) do update set value = excluded.value;

commit;
