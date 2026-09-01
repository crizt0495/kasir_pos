# Cara Apply Migration 0012_customer_debt.sql ke Supabase Production

## ⚠️ Penting
Migration ini menambahkan fitur pembayaran hutang pelanggan.
Tanpa di-apply, aplikasi akan error 500 saat mengakses customers.

## Langkah 1: Buka Supabase Dashboard
1. Login ke [Supabase Dashboard](https://supabase.com/dashboard)
2. Pilih project Anda: `avhkihgcxdrzlxtpbovg`
3. Klik **SQL Editor** di sidebar kiri

## Langkah 2: Copy SQL Migration
1. Copy **semua isi** file berikut:
   ```
   supabase/migrations/0012_customer_debt.sql
   ```
2. Paste ke SQL Editor di dashboard

## Langkah 3: Jalankan Migration
1. Klik tombol **Run** (atau tekan F5)
2. Tunggu sampai muncul "Query executed successfully"
3. Jika ada error, screenshot dan kirim ke saya

## Langkah 4: Verifikasi
Setelah sukses, jalankan query ini untuk verifikasi:

```sql
-- Cek kolom baru
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name LIKE '%debt%';

-- Cek tabel baru
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'customer_debts';

-- Cek RPC functions
SELECT proname FROM pg_proc 
WHERE proname IN ('fn_record_debt', 'fn_pay_debt', 'fn_get_customer_debt_stats');
```

## Yang Ditambahkan
- ✅ Kolom `total_debt`, `pending_debt` di tabel `customers`
- ✅ Tabel `customer_debts` untuk tracking hutang individual
- ✅ RPC functions untuk operasi hutang (record, pay, stats)
- ✅ Index untuk performa
- ✅ RLS policies untuk keamanan

## Setelah Migration Sukses
1. Backend akan otomatis mendeteksi kolom baru
2. Fitur hutang di POS akan berfungsi
3. Error 500 akan hilang

## Jika Ada Error
Screenshot error dan kirim ke saya untuk bantuan.
