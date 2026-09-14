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
- **Pembelian**: harga beli produk yang tersinkron dari pembelian dicatat dengan sumber `Pembelian`.
- Tidak ada baris yang dicatat jika nilai lama == nilai baru.
- Data di halaman ini bersifat read-only (tidak bisa dihapus).

---

## ⚠️ Update — Migration 0035 (Revisi Pergerakan Harga)

**Wajib di-apply SETELAH 0034.** Mengubah aturan sinkronisasi harga beli dari pembelian:

1. Kolom baru `purchases.status_barang` (`DRAFT` / `BARANG_DITERIMA` / `BATAL`), di-backfill dari `status` yang ada.
2. Harga beli produk **HANYA** berubah saat pembelian berstatus **BARANG_DITERIMA** **dan** sudah **LUNAS** (`payment_status = paid`).
   - Draft dibuat/diedit **tidak** menulis ke `products.purchase_price` (membatalkan perilaku sinkron draft dari 0034).
   - Menerima barang pada pembelian belum lunas: stok masuk, harga tetap.
   - Mendeklarasikan LUNAS pada pembelian `BARANG_DITERIMA` → harga beli langsung disinkronkan.
3. Menghapus pembelian `BARANG_DITERIMA` → harga beli produk **dikembalikan** ke harga semula (catatan purchase-origin dihapus dari `price_movements` lewat kolom baru `id_referensi`).
   - Draft: dihapus tanpa efek harga. `BATAL`: tidak bisa dihapus.

### Cara Apply Migration 0035
```bash
./apply_migration_0035.sh   # dari root project (butuh psql + backend/.env)
```
Atau manual: copy `supabase/migrations/0035_status_barang_revisi_harga.sql` ke SQL Editor Supabase → Run.

### Verifikasi
```sql
-- Kolom & fungsi baru
SELECT column_name FROM information_schema.columns
WHERE table_name = 'purchases' AND column_name = 'status_barang';

SELECT proname FROM pg_proc
WHERE proname IN ('fn_sync_purchase_price', 'fn_set_purchase_payment_status', 'fn_delete_purchase');
```