#!/bin/bash
# Apply migration 0031: sinkron harga beli produk saat pembelian diterima
# Jalankan dari root project: ./apply_migration_0031.sh

set -e

echo "=========================================================="
echo "  Apply Migration 0031: Sinkron harga beli saat terima"
echo "=========================================================="

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
MIGRATION_FILE="supabase/migrations/0031_sync_purchase_price_on_receive.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ $MIGRATION_FILE tidak ditemukan"
  exit 1
fi

echo "📍 Project: $PROJECT_REF"
echo "📄 Migration: $MIGRATION_FILE"
echo ""

# ---- Fallback jika psql tidak terinstall ----
if ! command -v psql &> /dev/null; then
  echo "⚠️  psql tidak terinstall."
  echo ""
  echo "Opsi 1 — Supabase Dashboard (paling mudah):"
  echo "  1. Buka https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
  echo "  2. Copy-paste SELURUH isi $MIGRATION_FILE"
  echo "     (baris dimulai dari '-- ===...')"
  echo "  3. Klik 'Run' / F5"
  echo ""
  echo "Opsi 2 — Install psql:"
  echo "  Ubuntu/Debian : sudo apt install postgresql-client"
  echo "  macOS         : brew install postgresql"
  echo "  Termux/Android: pkg install postgresql"
  echo ""
  echo "Jalankan script ini lagi setelah install psql."
  exit 0
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
echo ""

# ---- Verifikasi ----
echo "🔍 Verifying..."
echo "  - fn_receive_purchase (harus ada & sync purchase_price):"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -U postgres -d postgres -tA -c \
  "SELECT substr(prosrc, position('purchase_price' in prosrc), 30) FROM pg_proc WHERE proname = 'fn_receive_purchase';"

echo "  - Produk dengan purchase_price > 0:"
PGPASSWORD="$SERVICE_KEY" psql -h "${PROJECT_REF}.supabase.co" -U postgres -d postgres -tA -c \
  "SELECT count(*) || ' produk' FROM public.products WHERE purchase_price > 0;"

echo ""
echo "Done!"
