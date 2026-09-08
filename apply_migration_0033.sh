#!/bin/bash
# Apply migration 0033: hapus sinkronisasi harga beli saat draft pembelian
# Jalankan dari root project: ./apply_migration_0033.sh

set -e

echo "=================================================="
echo "  Apply Migration 0033: Hapus sync harga saat draft"
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
MIGRATION_FILE="supabase/migrations/0033_remove_sync_price_on_draft.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ $MIGRATION_FILE tidak ditemukan"
  exit 1
fi

echo "📍 Project: $PROJECT_REF"
echo "📄 Migration: $MIGRATION_FILE"
echo ""

if ! command -v psql &> /dev/null; then
  echo "⚠️  psql tidak terinstall. Cara paling mudah:"
  echo ""
  echo "  1. Buka https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
  echo "  2. Copy-paste isi file $MIGRATION_FILE"
  echo "  3. Klik 'Run' / F5"
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
