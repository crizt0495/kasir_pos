-- Migration 0016: Hapus overload lama fn_pay_debt (3 argumen) agar tidak ada ambiguitas pada supabase.rpc()
-- Overload 3-arg sudah tidak diperlukan karena controller selalu mengirim 5 argumen dengan nilai default.
DROP FUNCTION IF EXISTS public.fn_pay_debt(uuid, numeric, uuid) CASCADE;

-- Verifikasi: hanya 1 overload fn_pay_debt (5 argumen) yang tersisa
SELECT proname, prosrc FROM pg_proc WHERE proname = 'fn_pay_debt' ORDER BY prosrc;