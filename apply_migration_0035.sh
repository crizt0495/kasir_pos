#!/bin/bash
# Apply migration 0035: revisi pergerakan harga — harga beli berubah
# hanya saat BARANG_DITERIMA + LUNAS (draft tidak menyinkronkan).
# Jalankan dari root project: ./apply_migration_0035.sh
#
# Skrip ini otomatis memastikan prasyarat dipenuhi:
#   - 0034_price_movements.sql DI-APPLY TERLEBIH DAHULU bila tabel
#     price_movements belum ada (0035 bergantung pada tabel tsb).
#   - 0035_status_barang_revisi_harga.sql di-apply setelahnya.
# Aman dijalankan ulang (idempoten).

set -e

echo "=================================================="
echo "  Apply Migration 0034 + 0035 (Revisi harga)"
echo "=================================================="

if [ ! -f backend/.env ]; then
  echo "❌ backend/.env tidak ditemukan"
  exit 1
fi

SUPABASE_URL=$(grep "^SUPABASE_URL=" backend/.env | cut -d'=' -f2-)
SERVICE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" backend/.env | cut -d'=' -f2-)

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "❌ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di backend/.env"
  exit 1
fi

PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://||' | cut -d'.' -f1)
MIGRATION_0034="supabase/migrations/0034_price_movements.sql"
MIGRATION_0035="supabase/migrations/0035_status_barang_revisi_harga.sql"

if [ ! -f "$MIGRATION_0034" ] || [ ! -f "$MIGRATION_0035" ]; then
  echo "❌ File migrasi 0034/0035 tidak ditemukan"
  exit 1
fi

echo "📍 Project: $PROJECT_REF"
echo "📄 Migration: $(basename "$MIGRATION_0035")"
echo ""

if ! command -v psql &> /dev/null; then
  echo "⚠️  psql tidak terinstall. Cara paling mudah:"
  echo ""
  echo "  1. Buka https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
  echo "  2. Copy-paste isi file $MIGRATION_0034 lalu klik Run"
  echo "  3. Copy-paste isi file $MIGRATION_0035 lalu klik Run"
  echo ""
  echo "Setelah install psql, jalankan script ini lagi."
  exit 1
fi

PSQL=(psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1)
export PGPASSWORD="$SERVICE_KEY"

echo "🔑 Connecting to Supabase..."

# 1) Prasyarat: pastikan tabel price_movements ada (dari 0034)
PRICE_MOVEMENTS_EXISTS=$(
  "${PSQL[@]}" -tA -c "select to_regclass('public.price_movements') is not null;"
)
if [ "$PRICE_MOVEMENTS_EXISTS" != "t" ]; then
  echo "▶️  price_movements belum ada — apply 0034_price_movements.sql dulu..."
  "${PSQL[@]}" -f "$MIGRATION_0034"
  echo "✔  0034 applied."
else
  echo "✔  price_movements sudah ada (0034 sudah di-apply)."
fi

# 2) Apply 0035 (idempoten; bisa dijalankan ulang)
echo "▶️  Applying 0035_status_barang_revisi_harga.sql..."
"${PSQL[@]}" -f "$MIGRATION_0035"
echo "✔  0035 applied."

# 3) Verifikasi kolom penting
STATUS_OK=$(
  "${PSQL[@]}" -tA -c "select to_regclass('public.price_movements') is not null and exists (select 1 from information_schema.columns where table_schema='public' and table_name='purchases' and column_name='status_barang') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='price_movements' and column_name='id_referensi');"
)
if [ "$STATUS_OK" != "t" ]; then
  echo "❌ Verifikasi gagal: kolom status_barang / id_referensi belum lengkap."
  exit 1
fi

echo ""
echo "✅ Migration berhasil! Kolom status_barang (purchases) & id_referensi (price_movements) tersedia."
echo "   API /api/purchases seharusnya sudah tidak mengembalikan 500."