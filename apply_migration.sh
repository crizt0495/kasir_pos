#!/bin/bash
# Apply migration 0012_customer_debt.sql ke Supabase production
# Jalankan dari root project: ./apply_migration.sh

set -e

echo "=================================================="
echo "  Apply Migration 0012: Hutang Pelanggan"
echo "=================================================="

# Get credentials from backend/.env
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

# Extract project ref
PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://||' | cut -d'.' -f1)
MIGRATION_FILE="supabase/migrations/0012_customer_debt.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ $MIGRATION_FILE tidak ditemukan"
  exit 1
fi

echo "📍 Project: $PROJECT_REF"
echo "📄 Migration: $MIGRATION_FILE"
echo ""

# Cek psql
if ! command -v psql &> /dev/null; then
  echo "⚠️  psql tidak terinstall. Cara paling mudah:"
  echo ""
  echo "  1. Buka https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
  echo "  2. Copy-paste isi file $MIGRATION_FILE"
  echo "  3. Klik 'Run' / F5"
  echo ""
  echo "Atau install psql:"
  echo "  - Ubuntu/Debian: sudo apt install postgresql-client"
  echo "  - macOS: brew install postgresql"
  echo "  - Termux: pkg install postgresql"
  echo ""
  echo "Setelah install psql, jalankan script ini lagi."
  exit 1
fi

echo "🔑 Connecting to Supabase..."
PGPASSWORD="$SERVICE_KEY" psql \
  -h "${PROJECT_REF}.supabase.co" \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f "$MIGRATION_FILE" \
  --single-transaction \
  -v ON_ERROR_STOP=1

echo ""
echo "✅ Migration applied successfully!"

# Verify
echo ""
echo "🔍 Verifying..."
echo "  - Kolom total_debt, pending_debt:"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -U postgres -d postgres -tA -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('total_debt', 'pending_debt') ORDER BY column_name;"

echo "  - Tabel customer_debts:"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -U postgres -d postgres -tA -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_name = 'customer_debts';"

echo "  - RPC functions:"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -U postgres -d postgres -tA -c \
  "SELECT proname FROM pg_proc WHERE proname IN ('fn_record_debt', 'fn_pay_debt', 'fn_get_customer_debt_stats') ORDER BY proname;"
