#!/bin/bash
# Apply migration 0013 via Supabase SQL API
set -e

if [ ! -f backend/.env ]; then
  echo "❌ backend/.env tidak ditemukan"
  exit 1
fi

SUPABASE_URL=$(grep "^SUPABASE_URL=" backend/.env | cut -d'=' -f2-)
SERVICE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" backend/.env | cut -d'=' -f2-)

PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://||' | cut -d'.' -f1)
SQL=$(cat supabase/migrations/0013_allow_partial_payment.sql)

echo "📍 Project: $PROJECT_REF"
echo "📄 Migration: 0013_allow_partial_payment.sql"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -X POST \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL" | jq -Rs .)}" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  echo "✅ Migration applied via REST API!"
else
  echo "⚠️  REST API gagal ($HTTP_CODE). Jalankan manual:"
  echo ""
  echo "  1. Buka https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"
  echo "  2. Copy-paste isi supabase/migrations/0013_allow_partial_payment.sql"
  echo "  3. Klik 'Run'"
  echo ""
  echo "Isi SQL:"
  echo "$BODY"
fi
