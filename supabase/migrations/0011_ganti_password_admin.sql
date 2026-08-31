-- ============================================================
-- POS APP — 0011_ganti_password_admin.sql
-- Ganti password akun admin default menjadi `Admin2026!x`.
--
-- Berlaku pada database live (Supabase). Jalankan lewat:
--   - SQL Editor di dashboard Supabase, ATAU
--   - `supabase db push` (kloning file ini ke proyek lokal)
-- Gunakan hash bcrypt via pgcrypto `crypt()` supaya konsisten
-- dengan seed (crypt/gen_salt).
-- ============================================================

-- Hash bcrypt `Admin2026!x` via pgcrypto. `gen_salt('bf',10)` membuat
-- salt baru tiap eksekusi — aman & idempotent (hanya menimpa hash lama).
update public.users
set
  password_hash = crypt('Admin2026!x', gen_salt('bf', 10)),
  must_change_password = false,
  updated_at = now()
where username = 'admin'
  and is_active = true;
