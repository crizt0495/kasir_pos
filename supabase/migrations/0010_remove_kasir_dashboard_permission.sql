-- ============================================================
-- 0010 — Hapus permission dashboard.view dari role Kasir
-- Role Kasir tidak perlu melihat dashboard.
-- ============================================================

-- Hapus permission dashboard.view dari role kasir (jika ada)
DELETE FROM public.role_permissions
WHERE role_id = (SELECT id FROM public.roles WHERE code = 'kasir')
  AND permission_id = (SELECT id FROM public.permissions WHERE code = 'dashboard.view');
