-- ============================================================
-- Drop function lama yang menyebabkan ambiguity
-- ============================================================

-- Drop all overloads of fn_create_sale
DROP FUNCTION IF EXISTS public.fn_create_sale(uuid, uuid, jsonb, uuid, numeric, numeric, numeric, text, numeric, text, uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.fn_create_sale(uuid, uuid, jsonb, uuid, numeric, numeric, numeric, text, numeric, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.fn_create_sale(uuid, uuid, jsonb, uuid, numeric, numeric, numeric, text, numeric, text, uuid, boolean, jsonb) CASCADE;

-- Verify
SELECT pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname = 'fn_create_sale';

-- Should be empty (0 rows) — semua sudah di-drop
-- Setelah itu, jalankan ulang migration 0014 dari awal