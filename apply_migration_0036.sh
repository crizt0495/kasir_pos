#!/bin/bash
# Apply migration 0036: idempotensi sinkronisasi transaksi offline.
#   - menambah kolom sales.offline_id + unique index parsial
#   - fn_create_sale versi 14-arg (p_offline_id) + fn_sale_result_idem
# Backend otomatis fallback ke versi 13-arg selama 0036 belum di-apply.
# Jalankan dari root project: ./apply_migration_0036.sh
# Aman dijalankan ulang (idempoten).

set -e

echo "=================================================="
echo "  Apply Migration 0036 (offline idempotency)"
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
MIGRATION_0036="supabase/migrations/0036_sale_offline_idempotency.sql"

if [ ! -f "$MIGRATION_0036" ]; then
  echo "❌ File migrasi 0036 tidak ditemukan"
  exit 1
fi

echo "📍 Project: $PROJECT_REF"
echo "📄 Migration: $(basename "$MIGRATION_0036")"
echo ""

if ! command -v psql &> /dev/null; then
  echo "⚠️  psql tidak terinstall. Cara paling mudah:"
  echo ""
  echo "  1. Buka https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
  echo "  2. Copy-paste SELURUH isi file supabase/migrations/0036_sale_offline_idempotency.sql"
  echo "  3. Klik 'Run' / F5"
  echo ""
  echo "Setelah install psql, jalankan script ini lagi."
  exit 1
fi

PSQL=(psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1)
export PGPASSWORD="$SERVICE_KEY"

echo "🔑 Connecting to Supabase..."

echo "▶️  Applying 0036_sale_offline_idempotency.sql..."
"${PSQL[@]}" -f "$MIGRATION_0036"
echo "✔  0036 applied."

# Verifikasi: kolom + unique index + fungsi 14-arg ada
VERIFY_OK=$(
  "${PSQL[@]}" -tA -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='sales' and column_name='offline_id') and to_regclass('public.uq_sales_offline_id') is not null and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_create_sale' and p.pronargs=14);"
)
if [ "$VERIFY_OK" != "t" ]; then
  echo "❌ Verifikasi gagal: kolom offline_id / unique index / fn_create_sale 14-arg belum lengkap."
  exit 1
fi

echo ""
echo "✅ Migration berhasil! Sinkronisasi transaksi offline sekarang idempoten —"
echo "   transaksi yang dikirim ulang (respons hilang/timeout) TIDAK akan terduplikasi."