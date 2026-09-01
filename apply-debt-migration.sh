#!/bin/bash
# ============================================================
# apply-debt-migration.sh — Apply migration hutang ke Supabase
#
# Menjalankan migration 0012 (customer_debts) & 0013 (partial)
# ke Supabase cloud via psql.
#
# Prasyarat: backend/.env berisi SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# atau berikan sebagai variabel lingkungan.
# ============================================================
set -e

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

# --- Cek psql ---
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

for MIG in 0012_customer_debt.sql 0013_allow_partial_payment.sql; do
  echo ""
  echo "🚀 Apply ${MIG}..."
  psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres \
    -f "supabase/migrations/${MIG}" \
    --single-transaction -v ON_ERROR_STOP=1
  echo "✅ ${MIG} berhasil."
done

echo ""
echo "🔍 Verifikasi..."
psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c "
SELECT 'function '||p.proname||' -> '||pg_get_function_identity_arguments(p.oid)
FROM pg_proc p WHERE p.proname IN ('fn_record_debt','fn_pay_debt','fn_get_customer_debt_stats');"

psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c "
SELECT 'kolom '||column_name FROM information_schema.columns
WHERE table_name='customers' AND column_name IN ('total_debt','pending_debt');"

echo ""
echo "🎉 Selesai! Error 400 di /api/customer-debts akan hilang."