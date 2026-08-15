#!/usr/bin/env bash
# ============================================================
# deploy.sh — Satu file untuk update otomatis ke GitHub
#
# Cara pakai:
#   ./deploy.sh                    → commit "update" + push ke GitHub
#   ./deploy.sh "pesan commit"     → commit dengan pesan sendiri
#   ./deploy.sh -v "pesan"         → commit + push + deploy ke Vercel
#   ./deploy.sh --help             → bantuan
#
# Prasyarat:
#   - SSH key sudah terhubung ke GitHub (sudah di-setup)
#   - Untuk deploy Vercel (-v): export VERCEL_TOKEN="vcp_..." dulu
# ============================================================
set -euo pipefail

# ---------- Konfigurasi ----------
GIT_BRANCH="${GIT_BRANCH:-main}"        # branch tujuan push
COMMIT_MSG="${1:-update}"               # pesan commit (argumen pertama)
DO_VERCEL=false

# Parse flag -v / --vercel
for arg in "$@"; do
  case "$arg" in
    -v|--vercel) DO_VERCEL=true ;;
    --help|-h)
      echo "Cara pakai: ./deploy.sh [pesan-commit] [-v]"
      echo "  pesan-commit : teks pesan commit (default: 'update')"
      echo "  -v / --vercel: juga deploy ke Vercel production"
      exit 0 ;;
  esac
done

# Gunakan argumen pertama sebagai pesan jika bukan flag
if [[ "${1:-}" != -* && -n "${1:-}" ]]; then
  COMMIT_MSG="$1"
fi

cd "$(dirname "$0")"

echo "============================================="
echo "  POS APP — Deploy Script"
echo "============================================="

# ---------- 1. Cek perubahan ----------
if [[ -z "$(git status --porcelain)" ]]; then
  echo ""
  echo "ℹ️  Tidak ada perubahan untuk di-commit."
  echo "   (Jika hanya ingin deploy Vercel, jalankan: ./deploy.sh -v)"
  echo ""
  DO_VERCEL=$DO_VERCEL
  if [[ "$DO_VERCEL" == false ]]; then
    exit 0
  fi
else
  echo ""
  echo "📦 Perubahan yang akan di-commit:"
  git status --short | head -20
  echo ""
  git add .

  echo "🔒 Verifikasi: memastikan tidak ada file .env / secret ikut ter-commit..."
  SECRET_FILES="$(git diff --cached --name-only | grep -E '\.env$|\.env\.[a-z0-9]+$|service.?role|secret|\.pem$' || true)"
  if [[ -n "$SECRET_FILES" ]]; then
    echo "⚠️  PERINGATAN — file sensitif terdeteksi:"
    echo "$SECRET_FILES"
    echo "Push DIBATALKAN. Hapus file tersebut dari staging lalu ulangi."
    exit 1
  fi
  echo "   OK — aman ✓"

  git commit -m "$COMMIT_MSG"
fi

# ---------- 2. Push ke GitHub ----------
echo ""
echo "🚀 Push ke GitHub ($GIT_BRANCH)..."
git push origin "$GIT_BRANCH"
echo "   Selesai ✓"

# ---------- 3. Opsional: Deploy Vercel ----------
if [[ "$DO_VERCEL" == true ]]; then
  echo ""
  echo "▲ Deploy ke Vercel production..."
  if [[ -z "${VERCEL_TOKEN:-}" ]]; then
    echo "⚠️  VERCEL_TOKEN belum di-set. Jalankan:"
    echo "   export VERCEL_TOKEN='vcp_...'"
    exit 1
  fi
  npx vercel deploy --prod --token "$VERCEL_TOKEN" --yes
  echo "   Selesai ✓"
fi

echo ""
echo "✅ Selesai! Semua perubahan sudah live."
