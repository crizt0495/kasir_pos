-- ============================================================
-- POS APP — 0037_recalc_sisa_hutang.sql
-- ------------------------------------------------------------
-- Rekonsiliasi: recalculate sisa hutang SEMUA pelanggan dari
-- data aktual customer_debts (single source of truth).
--
-- Target masalah: angka sisa hutang di POS (popup pilih pelanggan)
-- berbeda dengan halaman Pelanggan karena cache IndexedDB lokal
-- yang basi / field statis customers.pending_debt tidak sinkron.
--
-- SEMANTIK (harus identik dengan backend getSisaHutang):
--   total_debt   = SUM(amount) WHERE status != 'cancelled'
--   pending_debt = SUM(remaining_amount) WHERE status IN ('pending','partial','overdue')
-- ============================================================

create index if not exists idx_customer_debts_customer_status
  on public.customer_debts (customer_id, status);

update public.customers c
  set total_debt   = coalesce(agg.total_debt, 0),
      pending_debt = coalesce(agg.pending_debt, 0),
      updated_at   = now()
from (
  select
    customer_id,
    coalesce(sum(amount) filter (where status <> 'cancelled'), 0) as total_debt,
    coalesce(sum(remaining_amount) filter (where status in ('pending', 'partial', 'overdue')), 0) as pending_debt
  from public.customer_debts
  group by customer_id
) agg
where agg.customer_id = c.id;