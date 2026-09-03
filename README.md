# POS Kasir — Aplikasi Point of Sale Modern

Aplikasi **Point of Sale (POS) / Kasir** yang lengkap, aman, responsif, dan **production-ready** untuk bisnis nyata.

| Layer | Teknologi |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS v4 |
| Backend | Node.js + Express.js (REST API) |
| Database | Supabase PostgreSQL + Row Level Security (RLS) |
| Authentication | Custom username + password (bcrypt + JWT httpOnly cookie) |
| Authorization | RBAC dinamis berbasis database (`role_permissions`) |
| State | Zustand |
| Form & Validasi | React Hook Form + Zod (frontend & backend) |
| Charts | Recharts |
| Icons | Lucide React |
| Deployment | Vercel (frontend static + API serverless function) |
| Testing | Vitest (frontend), node:test + supertest (backend), Playwright (E2E) |

---

## Fitur

- 🔐 Login username + password, remember me, session timeout, protected routes, logout
- 👥 RBAC dinamis: **Owner & Kasir** (bisa diubah & dibuat baru)
- 🔑 Permission granular — dicek di **frontend** (sembunyikan menu) **dan backend** (403 Forbidden)
- 📱 **PWA**: installable di HP seperti aplikasi, web push notification ke Owner saat ada penjualan baru
- 💰 **Laba per transaksi**: snapshot harga beli/jual saat transaksi — perubahan harga tidak mengubah laba lama
- 🤝 **Bagi hasil pelanggan 2,5%**: dihitung dari **total laba pelanggan** (bukan omzet), per periode tahunan, dengan riwayat pembagian
- 🛒 POS / Kasir: grid produk, pencarian, **barcode scanner** (USB & manual), keranjang, diskon item & transaksi, hold/resume, checkout multi-metode pembayaran, struk 58mm/80mm
- 📦 Master data: produk, kategori, pelanggan, supplier (CRUD + search + filter + pagination server-side)
- 📊 Inventory: stok, **pergerakan stok tercatat** (SALE, PURCHASE, RETURN, ADJUSTMENT, OPNAME), stock opname, penyesuaian stok
- 🧾 Penjualan: nomor transaksi otomatis anti-duplikat, **transaksi atomic di level database** (ROLLBACK otomatis), retur/refund, cetak ulang struk
- 🛒 Pembelian: draft → diterima → **stok otomatis bertambah**
- 💵 Kas: buka/tutup sesi kas, expected vs actual, selisih, transaksi IN/OUT
- 💸 Pengeluaran (expense)
- 📈 Laporan: penjualan (harian/mingguan/bulanan/custom), profit (HPP), produk, stok, kasir, pembelian + **export CSV**
- 📊 Dashboard: penjualan hari ini, grafik 7 hari, produk terlaris, kategori, ringkasan pembayaran
- 📜 Audit log lengkap (user, action, module, record ID, IP, user agent, old/new data)
- ⌨️ Keyboard shortcut: `F1` POS, `F2` cari produk, `F4` pelanggan, `F8` pembayaran, `ESC` tutup modal, `Ctrl+K` global search
- 🔍 Global search (produk, transaksi, pelanggan, supplier)
- ⚙️ Settings: toko, POS & struk, pajak, inventory, session
- 📱 Responsif: 375px → 1920px

---

## Struktur Proyek

```
pos-app/
├── frontend/            # React + Vite + Tailwind
│   ├── src/
│   │   ├── api/         # Axios client + endpoint functions
│   │   ├── components/  # UI kit, layout, POS (struk), guards
│   │   ├── hooks/       # useApi, useDebounce, usePermission
│   │   ├── pages/       # Semua halaman (lazy loaded)
│   │   ├── schemas/     # Zod schemas (mirror backend)
│   │   ├── stores/      # Zustand: auth, cart, ui
│   │   ├── utils/       # format, cart, permission (unit-tested)
│   │   └── App.jsx
│   └── package.json
├── backend/             # Express REST API
│   └── src/
│       ├── config/      # env, supabase client (service role)
│       ├── controllers/ # Logic per modul
│       ├── middleware/  # auth, requirePermission, error, validate, rate-limit, audit
│       ├── routes/      # REST endpoints
│       ├── services/    # auth, audit, settings
│       ├── utils/       # response, pagination, csv, errors
│       ├── validators/  # Zod backend
│       └── server.js
├── supabase/
│   ├── migrations/      # 0001-0006 (schema, RLS, functions, misc, profit sharing, grants)
│   ├── seed.sql         # roles (Owner/Kasir), permissions, users, master data
│   └── config.toml      # Supabase CLI local
├── api/index.js         # Vercel serverless entry (Express)
├── vercel.json
├── .env.example
└── package.json         # npm workspaces
```

---

## Requirements

- Node.js **≥ 18** (direkomendasikan 20+)
- npm ≥ 9
- Akun [Supabase](https://supabase.com) (gratis)
- (Opsional) Supabase CLI untuk migrasi lokal

---

## 1. Setup Database Supabase

### Opsi A — Dashboard Supabase (mudah)

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**.
3. Jalankan file migrasi secara berurutan:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_functions.sql`
   - `supabase/migrations/0004_misc.sql`
   - `supabase/migrations/0005_profit_sharing.sql`
   - `supabase/migrations/0006_grants.sql`
   - `supabase/migrations/0007_opname_datetime.sql`
   - `supabase/migrations/0008_bigdata_performance.sql`
   - `supabase/migrations/0009_materialized_views.sql`
   - `supabase/migrations/0010_remove_kasir_dashboard_permission.sql`
   - `supabase/migrations/0011_ganti_password_admin.sql`
   - `supabase/migrations/0012_customer_debt.sql`
   - `supabase/migrations/0013_allow_partial_payment.sql`
   - `supabase/migrations/0014_debt_payments_and_cancel.sql`
   - `supabase/migrations/0015_fix_cancel_debt_double_subtract.sql`
4. Jalankan `supabase/seed.sql` terakhir.

> **Penting:** migrasi `0013`, `0014`, dan `0015` wajib dijalankan berurutan di SQL Editor jika tidak memakai Supabase CLI — migrasi `0015` memperbaiki bug penghitungan `pending_debt`/`total_debt` saat hutang dibatalkan (double-subtract) dan melakukan rekonsiliasi data yang sudah terlanjur salah. Jika sudah pernah migrasi lama, cukup jalankan yang belum pernah dieksekusi secara berurutan.

> `0006_grants.sql` memberikan hak akses DML ke role API (anon/authenticated/service_role) —
> diperlukan agar PostgREST bisa membaca tabel di lingkungan lokal. Keamanan tetap dijaga RLS
> (anon/authenticated tidak melihat data apa pun; service_role dipakai backend + `requirePermission`).
5. Catat dari **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ rahasia

### Opsi B — Supabase CLI

```bash
# Install CLI (lihat https://supabase.com/docs/guides/cli)
supabase login
supabase link --project-ref <ref-proyek>
supabase db push
# Jalankan seed:
psql "$DATABASE_URL" -f supabase/seed.sql
# atau reset lokal:
npm run db:setup
```

> ⚠️ **JANGAN pernah** menaruh `SUPABASE_SERVICE_ROLE_KEY` di frontend. Service role hanya dipakai backend/server. RLS tetap diaktifkan di semua tabel sehingga akses langsung lewat anon key tertutup.

---

## 2. Environment Variables

```bash
cp .env.example backend/.env
cp .env.example frontend/.env  # opsional
```

| Variabel | Lokasi | Keterangan |
|---|---|---|
| `SUPABASE_URL` | backend | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | ⚠️ Rahasia — hanya server |
| `JWT_SECRET` | backend | Generate: `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | backend | Default `8h` |
| `JWT_REMEMBER_EXPIRES_IN` | backend | Default `7d` |
| `CORS_ORIGIN` | backend | Origin frontend (dev: `http://localhost:5173`) |
| `PORT` | backend | Default `3001` |
| `VAPID_PUBLIC_KEY` | backend | Web Push — generate: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | backend | ⚠️ Rahasia Web Push — hanya server |
| `VAPID_SUBJECT` | backend | `mailto:admin@example.com` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | backend | Fallback notifikasi via Telegram Bot (opsional) |
| `VITE_API_BASE_URL` | frontend | Kosongkan; dev pakai proxy Vite `/api` |
| `VITE_VAPID_PUBLIC_KEY` | frontend | Kunci publik VAPID (sama dengan backend) untuk subscribe push dari browser |

---

## 3. Instalasi & Development

```bash
npm install            # install semua workspace
npm run dev            # backend :3001 + frontend :5173 bersamaan
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api (health: `/api/health`)

Vite mem-proxy `/api` ke backend, jadi tidak perlu mengatur CORS di development.

### Akun default (seed)

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin2026!x` | Owner |
| `kasir` | `Kasir123!` | Kasir |

> ⚠️ Kedua akun diberi flag **must_change_password = true** — sistem **memaksa ganti password** saat pertama login. Ganti segera! Untuk production, gunakan password acak via env/setup wizard (lihat §7).

---

## 4. Testing

```bash
npm test               # backend (node:test) + frontend (vitest)
npm run test -w backend
npm run test -w frontend
```

Coverage saat ini (80 unit/integration test):
- **Backend (47)**: login/logout/session, RBAC 403, validasi, product CRUD, barcode, penyesuaian stok, transaksi penjualan, **semua jenis laporan**, pagination, CSV, extract error, notifikasi
- **Frontend (33)**: kalkulasi keranjang, pajak, kembalian, format Rupiah, permission check, **laba & bagi hasil 2,5%**

Backend integration test memakai **Supabase client tiruan** (in-memory) — tidak butuh database hidup.

**E2E (Playwright)** — `frontend/e2e/pos.spec.js`: Login → Buka POS → Tambah Produk → Checkout → Pembayaran → Transaksi Sukses → Stok berkurang.

```bash
# butuh backend + Supabase terhubung & seed terpasang
cd frontend
npx playwright install chromium
test:e2e   # atau: npx playwright test
```

> Untuk E2E, akun seed memakai `must_change_password=true` (dipaksa ganti password).
> Set `must_change_password=false` dulu agar login test langsung berhasil:
> `update public.users set must_change_password = false where username in ('admin','kasir');`

---

## 5. Build Production

```bash
npm run build          # vite build → frontend/dist
npm run build -w frontend
```

---

## 6. Deploy ke Vercel

`vercel.json` sudah disiapkan:

- `frontend` → static build (`@vercel/static-build`)
- `api/index.js` → serverless function Express (`@vercel/node`)
- Rewrite: `/api/*` → fungsi API, `/*` → frontend (SPA fallback)

```bash
npm i -g vercel
vercel
```

Set environment variables di dashboard Vercel (**Settings → Environment Variables**): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `CORS_ORIGIN` (URL domain Vercel Anda, contoh `https://pos-app.vercel.app`), dst.

> Pastikan `CORS_ORIGIN` memuat domain produksi agar cookie dikirim.

---

## 7. Konfigurasi Production

- **JWT_SECRET**: random 64-hex (`openssl rand -hex 64`), jangan pernah sama dengan dev.
- **CORS**: daftar origin yang diizinkan (pisahkan koma).
- **Cookie**: otomatis `secure` + `httpOnly` + `sameSite=lax` di production.
- **Akun admin**: hapus/timpa akun seed, atau ubah password via halaman ganti password (diwajibkan).
- **Jangan commit `.env`** — sudah ada di `.gitignore`.
- **RLS**: semua tabel `enable row level security` dengan policy berbasis permission (lihat `0002_rls.sql`).

---

## 8. User Roles (Default)

Sistem role disederhanakan menjadi **2 role** (sederhana, cepat, mudah dirawat):

| Role | Deskripsi |
|---|---|
| **Owner** | Akses penuh: semua fitur, manajemen user/role, laporan, audit, settings, **bagi hasil 2,5%**, notifikasi penjualan |
| **Kasir** | Operasional transaksi: POS, penjualan, pelanggan, buka/tutup kas, lihat produk — **tanpa** hapus produk/user/role |

> ⚠️ Matriks di atas hanya **contoh awal**. Authorization sepenuhnya dinamis dari tabel database `roles` + `permissions` + `role_permissions` — Anda bisa ubah permission role kapan saja di **Settings → Roles**, dan perubahan langsung berlaku (session user di-invalidasi).

---

## 9. Permission System

Permission granular (diambil dari database), contoh:

```
dashboard.view        pos.access
sales.view            sales.create        sales.refund
products.view         products.create     products.update     products.delete
categories.*          customers.*         suppliers.*
inventory.view        inventory.adjust    stock_opname.*
purchases.*           cashier.open        cashier.close       cashier.view
expenses.*            returns.*           users.*             roles.*
reports.view          reports.export      settings.*          audit.view
profit.view           profit.distribute   notifications.view
```

**Backend WAJIB** memeriksa permission setiap endpoint:

```js
router.post('/products', requirePermission('products.create'), validate(productSchema), handler);
```

Jika tidak punya permission → `403 { success: false, message: 'Anda tidak memiliki akses', code: 'FORBIDDEN' }`.

---

## 10. Laba & Bagi Hasil 2,5% (Periode Tahunan)

**Laba dihitung per transaksi dengan snapshot harga:**

```
Laba Item       = (Harga Jual - Harga Beli) × Qty - diskon item
Laba Transaksi  = total seluruh laba item
```

- `sale_items.cost_price` & `sale_items.profit` menyimpan **harga beli/jual saat transaksi** — perubahan harga produk di kemudian hari **tidak** mengubah laba transaksi lama.
- `sales.profit` & `sales.total_cost` di-rekalkulasi otomatis saat **retur** (koreksi laba & stok; transaksi asli tidak dihapus).

**Bagi hasil 2,5% (BUKAN dari omzet):**

```
Nilai 2,5% = Total Laba Pelanggan × 2,5%
Contoh: laba Rp10.000.000 × 2,5% = Rp250.000
```

- Periode tahunan otomatis (`profit_periods`), hak per pelanggan (`customer_profit_shares`), status **Belum/Sudah Dibagikan**.
- Owner membagikan via halaman **Bagi Hasil 2,5%** → tercatat di `profit_distributions` (tanggal, jumlah, user, catatan) — **data historis tidak dihapus**.
- Pelanggan **"Pelanggan Umum"** (`is_general = true`, default di POS) **tidak** masuk perhitungan 2,5%; hanya pelanggan terdaftar yang dihitung.

## 10a. Notifikasi Penjualan ke HP Owner

- Setiap penjualan sukses mengirim **Web Push (PWA)** ke perangkat Owner: pelanggan, kasir, daftar produk, total, metode bayar, tanggal.
- Fallback **Telegram Bot** jika Web Push belum stabil / belum dikonfigurasi.
- Riwayat status tersimpan di `notification_logs` (`sent` / `failed` / `read`) — bel notifikasi di Topbar (Owner).
- **Fire-and-forget**: kegagalan notifikasi **tidak pernah** menggagalkan/rollback transaksi.

## 10b. PWA (Installable di HP)

- `manifest.webmanifest` + icon 192/512 + service worker (`/sw.js`) — bisa **Add to Home Screen** seperti aplikasi.
- Aktifkan push: generate VAPID keys, isi `VAPID_*` di backend dan `VITE_VAPID_PUBLIC_KEY` di frontend, lalu izinkan notifikasi saat pertama kali login sebagai Owner.

---

## 10c. Integritas Transaksi (Database Transaction)

Penjualan dibuat lewat fungsi PostgreSQL `fn_create_sale` yang berjalan **atomic**:

```
Create Sale → Create Sale Items → Create Payment →
Update Inventory → Create Inventory Movement → Create Audit Log → COMMIT
```

Jika salah satu gagal → **ROLLBACK total** (tidak mungkin transaksi tercatat tapi stok tidak berubah). Nomor transaksi (`INV-YYYYMMDD-000001`) memakai counter harian + advisory lock → **anti race-condition, anti duplikat**.

Fungsi transaksional lain: `fn_refund_sale`, `fn_receive_purchase`, `fn_complete_stock_opname`, `fn_adjust_stock`, `fn_create_purchase`, `fn_create_expense`.

---

## 11. Keamanan

- Helmet (security headers), CORS terbatas + credentials
- Rate limiting global + khusus login (anti brute-force)
- Password di-hash **bcrypt** — tidak pernah plaintext, tidak pernah dikirim ulang
- JWT di **httpOnly cookie** (tidak bisa diakses JS/XSS)
- Validasi Zod di frontend **dan** backend (harga ≥ 0, qty > 0, SKU/barcode/username unique)
- Error handler terpusat — **tidak ada stack trace** ke user
- RLS aktif di semua tabel; `SUPABASE_SERVICE_ROLE_KEY` hanya di server
- Audit log untuk semua aksi penting (login, CRUD, transaksi, retur, dsb.)
- `token_version` → session otomatis invalid saat password/role berubah

---

## 11. Checklist Final

- [x] Login & logout bekerja
- [x] Protected route & redirect session expired
- [x] Username + password (bukan email)
- [x] Role & permission bekerja (frontend + backend)
- [x] CRUD produk, kategori, customer, supplier
- [x] POS: barcode, checkout, payment, struk
- [x] Stok otomatis berkurang saat penjualan, bertambah saat pembelian diterima
- [x] Stock opname & penyesuaian stok
- [x] Retur / refund
- [x] Cash session buka/tutup + selisih
- [x] Expense
- [x] Laporan + export CSV
- [x] Audit log
- [x] Responsif (375px–1920px)
- [x] Validasi & error handling
- [x] RLS Supabase aktif
- [x] Tidak ada secret di frontend
- [x] Siap deploy Vercel (SPA fallback + API serverless)
- [x] PWA installable + notifikasi push ke HP Owner
- [x] Laba snapshot per transaksi + koreksi retur
- [x] Bagi hasil 2,5% tahunan + riwayat pembagian
- [x] Pelanggan Umum dikecualikan dari bagi hasil

---

## 12. Keyboard Shortcuts

| Shortcut | Fungsi |
|---|---|
| `F1` | Buka POS |
| `F2` | Fokus pencarian produk (di POS) |
| `F4` | Pilih pelanggan (di POS) |
| `F8` | Buka pembayaran (di POS) |
| `ESC` | Tutup modal |
| `Ctrl+K` | Global search |

---

## Pindah ke Perangkat Lain

Kode proyek tersimpan penuh di GitHub (`crizt0495/kasir_pos`), jadi bisa diklone di perangkat mana pun:

```bash
git clone git@github.com:crizt0495/kasir_pos.git
npm install
npm run dev
```

> ⚠️ Yang **tidak** ikut di git (harus disalin manual dari mesin lama): `backend/.env`, `frontend/.env`, `.vercel-token`. Semua daftar kredensial, status proyek, dan cara melanjutkan ada di file lokal **`PROJECT_HANDOVER.md`** (sengaja di-ignore git karena berisi info sensitif).

---

## Lisensi

Proyek internal — silakan digunakan untuk bisnis Anda.
# kasir_pos
