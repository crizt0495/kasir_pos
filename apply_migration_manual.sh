#!/bin/bash
# Script untuk apply migration 0012_customer_debt.sql
# Cara pakai:
#   ./apply_migration_manual.sh

set -e

echo "=================================================="
echo "  Apply Migration 0012: Hutang Pelanggan"
echo "=================================================="
echo ""

# Cek apakah psql tersedia
if ! command -v psql &> /dev/null; then
  echo "⚠️  psql tidak terinstall. Silakan gunakan Supabase Dashboard instead:"
  echo ""
  echo "  1. Buka: https://supabase.com/dashboard/project/avhkihgcxdrzlxtpbovg/sql/new"
  echo "  2. Copy isi file: supabase/migrations/0012_customer_debt.sql"
  echo "  3. Paste dan klik Run (F5)"
  echo ""
  echo "Atau install psql terlebih dahulu:"
  echo "  - Ubuntu/Debian: sudo apt install postgresql-client"
  echo "  - Termux: pkg install postgresql"
  echo "  - macOS: brew install postgresql"
  exit 1
fi

# Read credentials
if [ ! -f backend/.env ]; then
  echo "❌ backend/.env tidak ditemukan"
  exit 1
fi

SUPABASE_URL=$(grep "^SUPABASE_URL=" backend/.env | cut -d'=' -f2- | tr -d "'")
SERVICE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" backend/.env | cut -d'=' -f2- | tr -d "'")

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "❌ Credentials tidak lengkap di backend/.env"
  exit 1
fi

PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://||' | cut -d'.' -f1)

echo "📍 Project: $PROJECT_REF"
echo "🔑 Service Role: ${SERVICE_KEY:0:20}..."
echo ""

# Set password environment variable
export PGPASSWORD="$SERVICE_KEY"

# Cek koneksi
echo "🔌 Testing connection..."
if ! psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
  echo "❌ Koneksi gagal. Cek:"
  echo "   1. Service Role Key benar di backend/.env"
  echo "   2. Firewall/Internet tersedia"
  echo "   3. Project reference benar"
  exit 1
fi

echo "✅ Connected!"

# Jalankan migration
MIGRATION_FILE="supabase/migrations/0012_customer_debt.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ File migration tidak ditemukan: $MIGRATION_FILE"
  exit 1
fi

echo "🚀 Menjalankan migration..."
echo ""

PGPASSWORD="$SERVICE_KEY" psql \
  -h "${PROJECT_REF}.supabase.co" \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f "$MIGRATION_FILE" \
  --single-transaction \
  -v ON_ERROR_STOP=1

echo ""
echo "✅ Migration berhasil!"
echo ""

# Verifikasi
echo "🔍 Verifikasi..."
echo "Kolom debt:"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name LIKE '%debt%' ORDER BY 1;" 2>/dev/null || echo "  (colums tidak ditemukan)"

echo "Tabel customer_debts:"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -p 5432 -U postgres -d postgres -tA -c \
  "SELECT table_name FROM information_schema.tables WHERE table_name='customer_debts';" 2>/dev/null || echo "  (tabel tidak ditemukan)"

echo ""
echo "✅ Selesai!"
echo "Fitur hutang di POS sekarang dapat digunakan."
