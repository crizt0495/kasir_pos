-- Drop overload lama fn_pay_debt (3-arg) yang menyebabkan ambiguity
DROP FUNCTION IF EXISTS public.fn_pay_debt(uuid, numeric, uuid) CASCADE;

-- Verify hanya 1 overload (5-arg) yang tersisa
SELECT pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'fn_pay_debt';

-- Expected: 1 row dengan 5 parameters
-- p_debt_id uuid, p_amount numeric, p_created_by uuid, p_payment_method text, p_notes text