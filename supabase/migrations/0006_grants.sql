-- ============================================================
-- POS APP — 0006_grants.sql
-- Grant akses ke role API (anon, authenticated, service_role).
--
-- Di lingkungan lokal, Supabase CLI terkadang tidak menerapkan
-- default privileges ke tabel yang dibuat migrasi, sehingga
-- PostgREST gagal dengan "permission denied". Statement ini
-- idempoten dan aman dijalankan di cloud (cloud sudah punya grant
-- serupa — GRANT yang sama tidak berubah apa pun).
--
-- KEAMANAN tetap dijaga oleh RLS: anon/authenticated hanya bisa
-- membaca/mengubah baris yang diizinkan policy (default: TIDAK ADA).
-- service_role dipakai backend dengan requirePermission.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Tabel baru ke depan otomatis dapat grant yang sama
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
