-- ============================================================
-- POS APP — seed.sql
-- Data awal: roles (Owner & Kasir), permissions, role_permissions,
-- users, pelanggan umum, categories, product_units, products,
-- periode bagi hasil tahun berjalan, settings.
--
-- Akun default (WAJIB segera diganti password):
--   username: admin   password: Admin123!   role: Owner
--   username: kasir   password: Kasir123!   role: Kasir
-- Password di-hash dengan bcrypt (pgcrypto crypt/gen_salt).
-- ============================================================

-- ------------------------------------------------------------
-- ROLES (hanya 2: Owner & Kasir)
-- ------------------------------------------------------------
insert into public.roles (name, code, description, is_system) values
  ('Owner', 'owner', 'Pemilik toko — akses penuh ke semua fitur', true),
  ('Kasir', 'kasir', 'Menjalankan POS, penjualan, pelanggan, cetak struk', true)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- PERMISSIONS
-- ------------------------------------------------------------
insert into public.permissions (code, name, module, description) values
  ('dashboard.view',       'Lihat Dashboard',       'dashboard',  'Melihat ringkasan dashboard'),
  ('pos.access',           'Akses POS',             'pos',        'Mengakses halaman kasir / POS'),
  ('sales.view',           'Lihat Penjualan',       'sales',      'Melihat daftar & detail penjualan'),
  ('sales.create',         'Buat Penjualan',        'sales',      'Melakukan transaksi penjualan'),
  ('sales.update',         'Ubah Penjualan',        'sales',      'Mengubah data penjualan'),
  ('sales.delete',         'Hapus Penjualan',       'sales',      'Menghapus penjualan'),
  ('sales.refund',         'Retur Penjualan',       'sales',      'Melakukan retur / refund penjualan'),
  ('products.view',        'Lihat Produk',          'products',   'Melihat daftar & detail produk'),
  ('products.create',      'Tambah Produk',         'products',   'Menambah produk baru'),
  ('products.update',      'Ubah Produk',           'products',   'Mengubah data produk'),
  ('products.delete',      'Hapus Produk',          'products',   'Menghapus produk'),
  ('categories.view',      'Lihat Kategori',        'categories', 'Melihat kategori produk'),
  ('categories.create',    'Tambah Kategori',       'categories', 'Menambah kategori'),
  ('categories.update',    'Ubah Kategori',         'categories', 'Mengubah kategori'),
  ('categories.delete',    'Hapus Kategori',        'categories', 'Menghapus kategori'),
  ('inventory.view',       'Lihat Stok',            'inventory',  'Melihat stok & pergerakan stok'),
  ('inventory.create',     'Tambah Stok',           'inventory',  'Menambah stok masuk'),
  ('inventory.update',     'Ubah Stok',             'inventory',  'Mengubah data stok'),
  ('inventory.adjust',     'Penyesuaian Stok',      'inventory',  'Melakukan penyesuaian stok'),
  ('stock_opname.view',    'Lihat Stock Opname',    'stockopname','Melihat stock opname'),
  ('stock_opname.create',  'Buat Stock Opname',     'stockopname','Membuat stock opname'),
  ('stock_opname.update',  'Ubah Stock Opname',     'stockopname','Mengubah stock opname'),
  ('stock_opname.delete',  'Hapus Stock Opname',    'stockopname','Menghapus stock opname'),
  ('purchases.view',       'Lihat Pembelian',       'purchases',  'Melihat pembelian'),
  ('purchases.create',     'Buat Pembelian',        'purchases',  'Membuat pembelian'),
  ('purchases.update',     'Ubah Pembelian',        'purchases',  'Mengubah pembelian'),
  ('purchases.delete',     'Hapus Pembelian',       'purchases',  'Menghapus pembelian'),
  ('customers.view',       'Lihat Pelanggan',       'customers',  'Melihat pelanggan'),
  ('customers.create',     'Tambah Pelanggan',      'customers',  'Menambah pelanggan'),
  ('customers.update',     'Ubah Pelanggan',        'customers',  'Mengubah pelanggan'),
  ('customers.delete',     'Hapus Pelanggan',       'customers',  'Menghapus pelanggan'),
  ('suppliers.view',       'Lihat Supplier',        'suppliers',  'Melihat supplier'),
  ('suppliers.create',     'Tambah Supplier',       'suppliers',  'Menambah supplier'),
  ('suppliers.update',     'Ubah Supplier',         'suppliers',  'Mengubah supplier'),
  ('suppliers.delete',     'Hapus Supplier',        'suppliers',  'Menghapus supplier'),
  ('users.view',           'Lihat User',            'users',      'Melihat daftar pengguna'),
  ('users.create',         'Tambah User',           'users',      'Menambah pengguna'),
  ('users.update',         'Ubah User',             'users',      'Mengubah pengguna'),
  ('users.delete',         'Hapus User',            'users',      'Menghapus pengguna'),
  ('roles.view',           'Lihat Role',            'roles',      'Melihat role'),
  ('roles.create',         'Tambah Role',           'roles',      'Menambah role'),
  ('roles.update',         'Ubah Role',             'roles',      'Mengubah role & permission'),
  ('roles.delete',         'Hapus Role',            'roles',      'Menghapus role'),
  ('permissions.view',     'Lihat Permission',      'permissions','Melihat daftar permission'),
  ('reports.view',         'Lihat Laporan',         'reports',    'Melihat laporan'),
  ('reports.export',       'Export Laporan',        'reports',    'Mengexport laporan (CSV)'),
  ('settings.view',        'Lihat Pengaturan',      'settings',   'Melihat pengaturan aplikasi'),
  ('settings.update',      'Ubah Pengaturan',       'settings',   'Mengubah pengaturan aplikasi'),
  ('cashier.open',         'Buka Kas',              'cashier',    'Membuka sesi kas'),
  ('cashier.close',        'Tutup Kas',             'cashier',    'Menutup sesi kas'),
  ('cashier.view',         'Lihat Kas',             'cashier',    'Melihat sesi & transaksi kas'),
  ('expenses.view',        'Lihat Pengeluaran',     'expenses',   'Melihat pengeluaran'),
  ('expenses.create',      'Tambah Pengeluaran',    'expenses',   'Menambah pengeluaran'),
  ('expenses.update',      'Ubah Pengeluaran',      'expenses',   'Mengubah pengeluaran'),
  ('expenses.delete',      'Hapus Pengeluaran',     'expenses',   'Menghapus pengeluaran'),
  ('returns.view',         'Lihat Retur',           'returns',    'Melihat retur'),
  ('returns.create',       'Buat Retur',            'returns',    'Membuat retur'),
  ('audit.view',           'Lihat Audit Log',       'audit',      'Melihat log aktivitas'),
  ('profit.view',          'Lihat Laba & Bagi Hasil', 'profit',   'Melihat laba transaksi dan hak bagi hasil pelanggan'),
  ('profit.distribute',    'Bagikan Bagi Hasil',    'profit',     'Membagikan bagi hasil 2,5% ke pelanggan'),
  ('notifications.view',   'Lihat Notifikasi',      'notifications', 'Melihat riwayat notifikasi penjualan')
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- ROLE PERMISSIONS
-- ------------------------------------------------------------
-- Owner: semua permission
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'owner'
on conflict do nothing;

-- Kasir: minimal — transaksi & data operasional
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.code = 'kasir' and (
  p.code in ('dashboard.view', 'pos.access', 'sales.view', 'sales.create',
             'customers.view', 'customers.create', 'customers.update',
             'cashier.open', 'cashier.close', 'products.view',
             'stock_opname.view', 'stock_opname.create', 'inventory.view',
             'inventory.adjust')
)
on conflict do nothing;

-- ------------------------------------------------------------
-- USERS (password di-hash bcrypt)
-- ------------------------------------------------------------
insert into public.users (username, password_hash, is_active, must_change_password) values
  ('admin', crypt('Admin123!', gen_salt('bf', 10)), true, true),
  ('kasir', crypt('Kasir123!', gen_salt('bf', 10)), true, true)
on conflict (username) do nothing;

insert into public.profiles (id, full_name, email) values
  ((select id from public.users where username = 'admin'), 'Administrator', 'admin@pos-app.local'),
  ((select id from public.users where username = 'kasir'), 'Kasir Utama', 'kasir@pos-app.local')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id) values
  ((select id from public.users where username = 'admin'), (select id from public.roles where code = 'owner')),
  ((select id from public.users where username = 'kasir'), (select id from public.roles where code = 'kasir'))
on conflict do nothing;

-- ------------------------------------------------------------
-- PELANGGAN UMUM (tidak masuk bagi hasil 2,5%)
-- ------------------------------------------------------------
insert into public.customers (name, is_general, notes)
select 'Pelanggan Umum', true, 'Pelanggan default untuk transaksi tanpa identitas'
where not exists (select 1 from public.customers where name = 'Pelanggan Umum');

-- ------------------------------------------------------------
-- PERIODE BAGI HASIL TAHUN BERJALAN
-- ------------------------------------------------------------
insert into public.profit_periods (year, start_date, end_date, status)
select extract(year from current_date)::int, make_date(extract(year from current_date)::int, 1, 1),
       make_date(extract(year from current_date)::int, 12, 31), 'open'
where not exists (select 1 from public.profit_periods
                  where year = extract(year from current_date)::int);

-- ------------------------------------------------------------
-- MASTER DATA
-- ------------------------------------------------------------
insert into public.categories (name, description, status) values
  ('Makanan',    'Makanan & cemilan',        'active'),
  ('Minuman',    'Minuman ringan & kemasan', 'active'),
  ('Sembako',    'Sembilan bahan pokok',     'active'),
  ('Elektronik', 'Perangkat elektronik',     'active'),
  ('Lainnya',    'Kategori lainnya',         'active')
on conflict (name) do nothing;

insert into public.product_units (name, short_name) values
  ('Pcs', 'pcs'),
  ('Kilogram', 'kg'),
  ('Box', 'box'),
  ('Pack', 'pack'),
  ('Liter', 'L')
on conflict do nothing;

insert into public.products (sku, barcode, name, category_id, unit_id, purchase_price, sale_price, stock, min_stock, status, description) values
  ('BRG-0001', '8991001000001', 'Kopi Kapal Api 200gr',   (select id from public.categories where name = 'Sembako'),  (select id from public.product_units where short_name = 'pcs'), 12000, 15000, 50, 10, 'active', 'Kopi bubuk kemasan 200 gram'),
  ('BRG-0002', '8991001000002', 'Indomie Goreng',         (select id from public.categories where name = 'Makanan'),  (select id from public.product_units where short_name = 'pcs'), 2500, 3500, 120, 20, 'active', 'Mie instan goreng'),
  ('BRG-0003', '8991001000003', 'Air Mineral 600ml',      (select id from public.categories where name = 'Minuman'),  (select id from public.product_units where short_name = 'pcs'), 2500, 4000, 80, 15, 'active', 'Air mineral kemasan 600 ml'),
  ('BRG-0004', '8991001000004', 'Beras Premium 5kg',      (select id from public.categories where name = 'Sembako'),  (select id from public.product_units where short_name = 'pcs'), 65000, 72000, 30, 5, 'active', 'Beras premium kemasan 5 kg'),
  ('BRG-0005', '8991001000005', 'Teh Botol Sosro 350ml',  (select id from public.categories where name = 'Minuman'),  (select id from public.product_units where short_name = 'pcs'), 3000, 5000, 0, 10, 'active', 'Teh botol siap minum'),
  ('BRG-0006', '8991001000006', 'Charger USB Type-C',     (select id from public.categories where name = 'Elektronik'),(select id from public.product_units where short_name = 'pcs'), 15000, 25000, 15, 5, 'active', 'Charger kabel USB Type-C')
on conflict (sku) do nothing;

-- ------------------------------------------------------------
-- SETTINGS
-- ------------------------------------------------------------
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
