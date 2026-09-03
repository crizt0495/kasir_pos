-- ============================================================
-- 0016_remove_dead_permissions.sql
-- Menghapus permission yang TIDAK menjaga endpoint apa pun (mati).
-- Kode ini muncul di panel "Atur Permission" tapi memberi/mencabutnya
-- tidak berefek, sehingga menyesatkan operator.
--
-- Dihapus (10): sales.update, sales.delete, inventory.create,
--   inventory.update, returns.create, returns.update, returns.delete,
--   profit.create, profit.update, profit.delete
--
-- Berjalan aman secara idempotent (delete by code, tak peduli ada/tidak).
-- ============================================================

delete from public.permissions
where code in (
  'sales.update',
  'sales.delete',
  'inventory.create',
  'inventory.update',
  'returns.create',
  'returns.update',
  'returns.delete',
  'profit.create',
  'profit.update',
  'profit.delete'
);