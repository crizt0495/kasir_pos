-- Check fn_create_sale function signature
-- Run this in Supabase SQL Editor

SELECT pg_get_function_arguments(oid) 
FROM pg_proc 
WHERE proname = 'fn_create_sale';

-- Optional: also show full function definition
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_create_sale';