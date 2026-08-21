# AGENTS.md — POS Kasir

## Project
Aplikasi Point of Sale (POS) modern: React 18 + Vite + Tailwind CSS v4 (frontend), Express.js (backend), Supabase PostgreSQL + RLS (DB), Zustand, Recharts, Lucide React. Workspace npm di root: `frontend/`, `backend/`.

## Workflow Git
- Setiap perbaikan/fitur selesai dan lolos test: langsung commit (gaya conventional: `feat:`/`fix:` + deskripsi Indonesia) lalu push ke `origin main` tanpa menunggu diminta.

## Command penting
- Dev (dari root): `npm run dev` (backend :3001 + frontend :5173 via concurrently)
- Build: `npm run build` (build frontend)
- Test frontend: `npm run test -w frontend` (Vitest, 33 tests)
- Test backend: `npm run test -w backend`
- E2E: `npx playwright test` (dari `frontend/`) — butuh backend + Supabase live. CATATAN: `playwright.config.js` menjalankan `dev:backend` dari folder frontend sehingga gagal sendiri; jalankan `npm run dev:backend` & `npm run dev:frontend` manual dulu, lalu `npx playwright test` (config pakai `reuseExistingServer: true`).

## Bahasa & Konvensi
- Seluruh UI berbahasa Indonesia (label, pesan error, toast, dsb.).
- Jangan tambahkan komentar kode kecuali diminta.
- Kode style: React function components, hooks di `src/hooks/`, API di `src/api/index.js` (objek per resource), state global Zustand di `src/stores/` (authStore, cartStore, uiStore).
- Validasi: Zod schema di `src/schemas/index.js` (mirror backend), dipakai bersama react-hook-form (`zodResolver`).
- Format angka/uang: `src/utils/format.js` → `formatRupiah`, `formatNumber`, `formatQty`, `formatDate`, `formatDateTime`.
- Permission: `usePermission()` hook (`can`, `hasAny`) atau `useAuthStore`. Menu disaring di `Sidebar.jsx`.
- Ikon: lucide-react. Chart: recharts.

## UI/UX (sudah di-polish — pertahankan gaya ini)
- Design tokens di `frontend/src/index.css` (`@theme`): warna primary(indigo)/success/warning/danger/info/slate + utility: `skeleton-shimmer`, `glass`, `surface-grid`, `card-hover`, `text-gradient`, `pill`.
- Komponen UI base di `src/components/ui/`: Button, Modal/Drawer/ConfirmDialog, DataTable/Pagination/SearchInput, Form (Field/Input/Select/Textarea/Checkbox/Switch), Feedback (Badge/StatusBadge/StatCard/EmptyState/ErrorState/Skeleton/Toaster/ProgressBar), Tabs/Dropdown, dan **PageHeader** (`title`, `description`, `actions`).
- Gunakan `PageHeader` untuk judul halaman daftar; jangan tulis header manual.
- StatCard: ikon pakai `bg-gradient-to-br from-X-400 to-X-600 text-white shadow-md shadow-X-500/25`.
- Skeleton: class `skeleton-shimmer` (bukan `animate-pulse bg-slate-200`).
- EmptyState: ikon dalam chip `bg-slate-100 text-slate-300`.
- Tombol primary: gradient `bg-gradient-to-b from-primary-500 to-primary-600`.
- Body background: `bg-slate-100`; main layout pakai `surface-grid app-backdrop`.
- Font: Inter Variable. Radius besar (rounded-xl/2xl), bayangan lembut, transisi halus.

## Area yang belum dikerjakan (jika dilanjutkan)
- Dark mode belum didukung (hanya light).
- `playwright.config.js` script `dev:backend` belum diperbaiki (bug yang sudah ada).
- PWA `sw.js` dan manifest ada namun belum diverifikasi penuh.

## Selector E2E yang TIDAK BOLEH diubah
Login: placeholder `Masukkan username` / `Masukkan password`, button `Login`. Dashboard: heading `Dashboard`. POS: link `POS / Kasir`, teks `Keranjang`, placeholder `Cari produk (F2)...`, tombol /Bayar/, `Grand Total`, testid `cash-received`, tombol /Proses Pembayaran/, `Struk Transaksi`, `INV-`, `Terima kasih`.
