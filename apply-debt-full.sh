#!/bin/bash
# ============================================================
# apply-debt-full.sh — Apply SEMUA migration fitur hutang ke Supabase
# ------------------------------------------------------------
# Sejak fitur hutang dimulai (0012), urutan migration penting:
#   0012 → 0013 → 0014 → 0015 → 0016_drop_old_fn_pay_debt
#        → 0017 → 0021 → 0022 → 0030
#
# Script ini menggabungkan semuanya menjadi SATU transaksi dan
# mengirimnya ke Supabase via psql. Aman dijalankan berulang
# (file 0012+ sudah idempoten: create if not exists / or replace).
#
# Prasyarat: backend/.env berisi SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#            (atau export keduanya), dan migration base 0001-0011
#            sudah terpasang (tabel users, customers, sales, dll).
#
# - Tanpa pelanggan: jalankan langsung ./apply-debt-full.sh
# - SQL Editor: gunakan file hasil generate di /tmp/debt_full.sql
# ============================================================
set -e

cd "$(dirname "$0")"

# --- Baca kredensial dari backend/.env atau env ---
if [ -f backend/.env ]; then
  export $(grep -E "^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" backend/.env | xargs)
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak lengkap."
  echo "   Isi backend/.env atau export keduanya dulu."
  exit 1
fi

PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://||' | cut -d'.' -f1)
echo "📍 Project: $PROJECT_REF"

if ! command -v psql &>/dev/null; then
  echo "❌ psql tidak terinstall. Install dulu:"
  echo "   Ubuntu: sudo apt install postgresql-client"
  echo "   Termux: pkg install postgresql"
  exit 1
fi

export PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY"

echo "🔌 Mengetes koneksi..."
if ! psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -c "SELECT 1" &>/dev/null; then
  echo "❌ Koneksi gagal. Cek SERVICE_ROLE_KEY (bukan anon key) & internet."
  exit 1
fi
echo "✅ Terhubung."

# --- Gabungkan semua migration hutang ---
MIGRATIONS=(
  "supabase/migrations/0012_customer_debt.sql"
  "supabase/migrations/0013_allow_partial_payment.sql"
  "supabase/migrations/0014_debt_payments_and_cancel.sql"
  "supabase/migrations/0015_fix_cancel_debt_double_subtract.sql"
  "supabase/migrations/0016_drop_old_fn_pay_debt.sql"
  "supabase/migrations/0017_fix_customer_debt_stats_exclude_cancelled.sql"
  "supabase/migrations/0021_fix_refund_unit_price.sql"
  "supabase/migrations/0022_refund_reduces_debt.sql"
  "supabase/migrations/0030_fix_debt_stale_pending.sql"
)

COMBINED="$(mktemp -u /tmp/debt_full_XXXX.sql)"

: > "$COMBINED"
for f in "${MIGRATIONS[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ File tidak ditemukan: $f"
    exit 1
  fi
  {
    echo ""
    echo "/* ============ $f ============ */"
    echo ""
    cat "$f"
  } >> "$COMBINED"
done

echo "📄 Menggabungkan ${#MIGRATIONS[@]} migration → $COMBINED"

# --- Terapkan dalam satu transaksi ---
echo "🚀 Apply migration hutang ke Supabase..."
psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres \
  -f "$COMBINED" --single-transaction -v ON_ERROR_STOP=1
echo "✅ Berhasil."

# --- Verifikasi ---
echo ""
echo "🔍 Verifikasi..."
psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c "
SELECT 'tabel customer_debts -> ' || CASE WHEN to_regclass('public.customer_debts') IS NULL THEN 'TIDAK ADA' ELSE 'OK' END;"
psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c "
SELECT 'kolom sale_id -> ' || CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='customer_debts' AND column_name='sale_id'
) THEN 'OK' ELSE 'TIDAK ADA' END;"
psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c "
SELECT 'fn_pay_debt(5-arg) -> ' || CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc WHERE proname='fn_pay_debt' AND pronargs=5
) THEN 'OK' ELSE 'TIDAK ADA' END;"
psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c "
SELECT 'fn_adjust_debt_on_refund -> ' || CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc WHERE proname='fn_adjust_debt_on_refund'
) THEN 'OK' ELSE 'TIDAK ADA' END;"

echo ""
echo "🎉 Selesai! Semua fitur hutang siap."
echo "   File SQL gabungan tersimpan di: $COMBINED"
echo "   (bisa dipakai di SQL Editor Supabase jika perlu)"