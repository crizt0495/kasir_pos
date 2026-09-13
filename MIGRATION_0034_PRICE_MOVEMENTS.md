# Cara Apply Migration 0034_price_movements.sql ke Supabase Production

## ⚠️ Penting
Migration ini menambahkan fitur **Pergerakan Harga** (audit riwayat perubahan harga beli/jual).
Tanpa di-apply, halaman "Pergerakan Harga" akan error 500 (tabel `price_movements` belum ada).

## Langkah 1: Buka Supabase Dashboard
1. Login ke [Supabase Dashboard](https://supabase.com/dashboard)
2. Pilih project Anda: `avhkihgcxdrzlxtpbovg`
3. Klik **SQL Editor** di sidebar kiri

## Langkah 2: Copy SQL Migration
1. Copy **semua isi** file berikut:
   ```
   supabase/migrations/0034_price_movements.sql
   ```
2. Paste ke SQL Editor di dashboard

## Langkah 3: Jalankan Migration
1. Klik tombol **Run** (atau tekan F5)
2. Tunggu sampai muncul "Query executed successfully"
3. Jika ada error, screenshot dan kirim ke saya

## Langkah 4: Verifikasi
Setelah sukses, jalankan query ini untuk verifikasi:

```sql
-- Cek tabel baru
SELECT table_name FROM information_schema.tables
WHERE table_name = 'price_movements';

-- Cek fungsi bantu
SELECT proname FROM pg_proc
WHERE proname IN ('fn_append_price_movement', 'fn_log_price_movement_trigger');

-- Cek trigger aktif di products
SELECT tgname FROM pg_trigger
WHERE tgname = 'trg_price_movement_log';

-- Paksa isi sampel: catat perubahan harga jual sebuah produk
-- (ganti <PRODUCT_ID> dengan id produk yang ada)
SELECT public.fn_append_price_movement(
  '<PRODUCT_ID>', 'sale_price', 10000, 12000, 'edit_produk', NULL
);
SELECT id, product_id, price_type, old_value, new_value, difference, source, changed_by_name, created_at
FROM public.price_movements ORDER BY created_at DESC LIMIT 5;
```

## Cara Kerja Pencatatan (otomatis)
- **Edit Produk**: setiap kali `purchase_price` / `sale_price` produk diubah lewat aplikasi,
  trigger `trg_price_movement_log` mencatat otomatis dengan sumber `Edit Produk` (hanya jika nilainya benar-benar berubah).
- **Pembelian**: saat membuat / mengubah / menerima pembelian, harga beli produk yang tersinkron
  dicatat dengan sumber `Pembelian`.
- Tidak ada baris yang dicatat jika nilai lama == nilai baru.
- Data di halaman ini bersifat read-only (tidak bisa dihapus).