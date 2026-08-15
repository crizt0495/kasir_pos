#!/usr/bin/env bash
# ============================================================
# deploy.sh — Satu file deploy lengkap (GitHub + Vercel)
#
# Alur otomatis:
#   1. Cek & tarik perubahan terbaru (anti konflik)
#   2. Jalankan tes (backend + frontend) + build production
#   3. Verifikasi keamanan (tidak ada .env/secret)
#   4. Commit + push ke GitHub
#   5. Buat tag versi (git tag) untuk rollback
#   6. (opsional -v) Deploy ke Vercel + verifikasi health
#
# Cara pakai:
#   ./deploy.sh                          → commit "update" + push
#   ./deploy.sh "perbaiki bug checkout"  → commit dengan pesan sendiri
#   ./deploy.sh -v                       → + deploy ke Vercel production
#   ./deploy.sh -v -t                    → + juga buat git tag versi
#   ./deploy.sh --no-test                → lewati tes & build (cepat)
#   ./deploy.sh --help                   → bantuan lengkap
#
# Prasyarat:
#   - SSH key terhubung ke GitHub
#   - Vercel: export VERCEL_TOKEN='vcp_...' ATAU simpan di file .vercel-token
#     (file .vercel-token otomatis di-ignore git — aman)
# ============================================================
set -euo pipefail

# ---------- Konfigurasi ----------
GIT_BRANCH="${GIT_BRANCH:-main}"
COMMIT_MSG="update"
DO_VERCEL=false
DO_TAG=false
RUN_TESTS=true

# ---------- Bantuan ----------
show_help() {
  cat <<'EOF'
Cara pakai: ./deploy.sh [pesan-commit] [opsi]

  pesan-commit           Teks pesan commit (default: "update")
  -v, --vercel           Deploy ke Vercel production setelah push
  -t, --tag              Buat git tag versi (untuk rollback)
  --no-test              Lewati tes & build (deploy cepat)
  -h, --help             Tampilkan bantuan ini

Contoh:
  ./deploy.sh                          # commit + push saja
  ./deploy.sh "fix: perbaiki stok"     # dengan pesan sendiri
  ./deploy.sh -v "feat: laporan baru"  # + deploy Vercel
  ./deploy.sh -v -t                    # + tag versi (auto-increment)
EOF
}

# ---------- Parse argumen ----------
for arg in "$@"; do
  case "$arg" in
    -v|--vercel) DO_VERCEL=true ;;
    -t|--tag)    DO_TAG=true ;;
    --no-test)   RUN_TESTS=false ;;
    -h|--help)   show_help; exit 0 ;;
    -*)
      echo "❌ Opsi tidak dikenal: $arg (lihat ./deploy.sh --help)"
      exit 1 ;;
    *) COMMIT_MSG="$arg" ;;
  esac
done

cd "$(dirname "$0")"

# ---------- Baca VERCEL_TOKEN: env dulu, lalu file .vercel-token ----------
if [[ -z "${VERCEL_TOKEN:-}" && -f .vercel-token ]]; then
  VERCEL_TOKEN="$(cat .vercel-token | tr -d '[:space:]')"
fi

echo "============================================="
echo "  🚀 POS APP — Deploy Script"
echo "============================================="

# ---------- 0. Cek branch ----------
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]]; then
  echo "⚠️  Anda di branch '$CURRENT_BRANCH', bukan '$GIT_BRANCH'."
  echo "   Lanjutkan di branch '$GIT_BRANCH'? [y/N]"
  read -r confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Dibatalkan."
    exit 1
  fi
fi

# ---------- 1. Tes + build (kecuali --no-test) ----------
if [[ "$RUN_TESTS" == true ]]; then
  echo ""
  echo "🧪 Menjalankan tes & build production..."
  echo "   → Backend tests"
  npm run test -w backend > /tmp/deploy-backend-test.log 2>&1 && echo "   ✓ Backend tests PASS" || {
    echo "   ❌ Backend tests GAGAL — lihat /tmp/deploy-backend-test.log"
    exit 1
  }
  echo "   → Frontend tests"
  npm run test -w frontend > /tmp/deploy-frontend-test.log 2>&1 && echo "   ✓ Frontend tests PASS" || {
    echo "   ❌ Frontend tests GAGAL — lihat /tmp/deploy-frontend-test.log"
    exit 1
  }
  echo "   → Build production"
  npm run build -w frontend > /tmp/deploy-build.log 2>&1 && echo "   ✓ Build sukses" || {
    echo "   ❌ Build GAGAL — lihat /tmp/deploy-build.log"
    exit 1
  }
else
  echo ""
  echo "⏭️  Lewati tes & build (--no-test)"
fi

# ---------- 2. Commit (jika ada perubahan) ----------
if [[ -z "$(git status --porcelain)" ]]; then
  echo ""
  echo "ℹ️  Tidak ada perubahan untuk di-commit."
else
  echo ""
  echo "📦 Perubahan yang akan di-commit:"
  git status --short | head -25
  echo ""

  git add .

  echo "🔒 Verifikasi keamanan (file .env / secret)..."
  SECRET_FILES="$(git diff --cached --name-only | grep -E '\.env$|\.env\.[a-z0-9]+$|service.?role|secret|\.pem$|vercel-token' || true)"
  if [[ -n "$SECRET_FILES" ]]; then
    echo "   ❌ PERINGATAN — file sensitif terdeteksi:"
    echo "$SECRET_FILES" | sed 's/^/      /'
    echo "   Push DIBATALKAN. Keluarkan file tsb dari staging lalu ulangi."
    exit 1
  fi
  echo "   ✓ Aman — tidak ada secret"

  git commit -m "$COMMIT_MSG"
  echo "   ✓ Commit: $(git rev-parse --short HEAD)"
fi

# Tarik perubahan terbaru (rebase commit lokal di atas remote — anti konflik)
echo ""
echo "📥 Sinkronisasi dengan remote ($GIT_BRANCH)..."
git pull --rebase origin "$GIT_BRANCH" 2>&1 | sed 's/^/   /' || {
  echo "⚠️  Gagal pull (kemungkinan konflik). Selesaikan dulu, lalu ulangi."
  exit 1
}
echo "   Sinkron ✓"

# ---------- 3. Push ke GitHub ----------
echo ""
echo "🚀 Push ke GitHub ($GIT_BRANCH)..."
git push origin "$GIT_BRANCH"
echo "   ✓ Push sukses"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
echo "   📍 Commit: $COMMIT_SHORT — $COMMIT_MSG"

# ---------- 4. Tag versi (opsional -t) ----------
if [[ "$DO_TAG" == true ]]; then
  LATEST_TAG="$(git tag --list 'v*' | sort -V | tail -1)"
  if [[ -z "$LATEST_TAG" ]]; then
    NEW_TAG="v1.0.0"
  else
    # naikkan patch: v1.2.3 → v1.2.4
    NEW_TAG="$(echo "$LATEST_TAG" | awk -F. '{print $1"."$2"."($3+1)}')"
  fi
  git tag "$NEW_TAG"
  git push origin "$NEW_TAG"
  echo "   🏷️  Tag: $NEW_TAG (rollback: git checkout $NEW_TAG)"
fi

# ---------- 5. Deploy Vercel (opsional -v) ----------
if [[ "$DO_VERCEL" == true ]]; then
  echo ""
  echo "▲ Deploy ke Vercel production..."
  if [[ -z "${VERCEL_TOKEN:-}" ]]; then
    echo "   ❌ VERCEL_TOKEN belum tersedia. Cara:"
    echo "      export VERCEL_TOKEN='vcp_...'"
    echo "      ATAU buat file .vercel-token berisi token (auto di-ignore git)."
    exit 1
  fi
  DEPLOY_OUT="$(npx vercel deploy --prod --token "$VERCEL_TOKEN" --yes 2>&1)"
  echo "$DEPLOY_OUT" | grep -vE "npm warn|EBADENGINE|deprecated|^\s*$|npm fund" | sed 's/^/   /'
  DEPLOY_URL="$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | head -1)"

  # ---------- 6. Verifikasi health setelah deploy ----------
  if [[ -n "$DEPLOY_URL" ]]; then
    echo ""
    echo "🔍 Verifikasi health deployment..."
    sleep 3
    for i in 1 2 3 4 5; do
      CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://$DEPLOY_URL/api/health" || echo 000)"
      if [[ "$CODE" == "200" ]]; then
        echo "   ✓ Health OK (API 200) — $DEPLOY_URL"
        break
      fi
      echo "   ⏳ Menunggu siap... ($CODE)"
      sleep 5
    done
    if [[ "$CODE" != "200" ]]; then
      echo "   ⚠️  API belum siap setelah 25 detik. Cek dashboard Vercel."
    fi
    echo ""
    echo "   🌐 Aplikasi: https://$DEPLOY_URL"
  fi
fi

echo ""
echo "============================================="
echo "  ✅ Selesai! Semua perubahan sudah live."
echo "============================================="
