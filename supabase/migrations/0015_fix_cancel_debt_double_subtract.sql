-- ============================================================
-- POS APP — 0015_fix_cancel_debt_double_subtract.sql
-- ------------------------------------------------------------
-- Perbaikan bug pembatalan hutang (spec §20) + trigger:
--
-- MASALAH 1: fn_cancel_debt (0014) mengurangi customers.pending_debt
--   secara manual. PADAHAL trigger trg_update_customer_debt_totals
--   (0012) JUGA mengurangi pending_debt saat status berubah menjadi
--   'cancelled'. Akibatnya pending_debt berkurang DUA KALI.
--
-- MASALAH 2: trigger yang sama mengurangi total_debt DAN
--   pending_debt saat status berubah ke 'paid'. Ini salah karena
--   hutang yang lunas tetap dihitung di total_debt (laporan hanya
--   mengecualikan status 'cancelled'), sehingga total_debt kepotong
--   dan pending_debt berkurang dua kali (digabung update manual
--   di fn_pay_debt).
--
-- SEMANTIK YANG BENAR (sesuai laporan hutang):
--   - total_debt   : jumlah nominal hutang yang TIDAK dibatalkan
--                    (lunas tetap dihitung).
--   - pending_debt : jumlah sisa hutang yang belum dibayar.
--   => Saat 'paid'     : hanya pending_debt berkurang.
--   => Saat 'cancelled': total_debt DAN pending_debt berkurang.
--
-- PERBAIKAN:
--   1. Trigger trg_update_customer_debt_totals hanya memproses
--      transisi ke 'cancelled' (kurangi total_debt + pending_debt
--      SEKALI). Tidak lagi menyentuh status 'paid' — fn_pay_debt
--      sudah menangani pengurangan pending_debt-nya sendiri.
--   2. fn_cancel_debt di-recreate TANPA update manual pending_debt,
--      karena trigger kini sudah memotong total_debt + pending_debt
--      tepat satu kali.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERBAIKAN TRIGGER — hanya transisi ke 'cancelled'
-- ------------------------------------------------------------
create or replace function public.update_customer_debt_totals()
returns trigger as $$
begin
  -- Kurangi total_debt & pending_debt tepat sekali ketika hutang
  -- dibatalkan (laporan mengecualikan status 'cancelled').
  -- TIDAK memproses status 'paid' — pending_debt sudah dikurangi
  -- manual di fn_pay_debt; total_debt tetap untuk hutang lunas.
  if (TG_OP = 'UPDATE' and OLD.status <> 'cancelled' and NEW.status = 'cancelled') then
    update public.customers
      set total_debt = GREATEST(COALESCE(total_debt, 0) - OLD.remaining_amount, 0),
          pending_debt = GREATEST(COALESCE(pending_debt, 0) - OLD.remaining_amount, 0),
          updated_at = now()
      where id = OLD.customer_id;
  end if;

  return NULL;
end;
$$ language plpgsql;

drop trigger if exists trg_update_customer_debt_totals on public.customer_debts;
create trigger trg_update_customer_debt_totals
  after update on public.customer_debts
  for each row
  execute function public.update_customer_debt_totals();

-- ------------------------------------------------------------
-- 2. PERBAIKAN FN_CANCEL_DEBT — tanpa update manual pending_debt
-- ------------------------------------------------------------
create or replace function public.fn_cancel_debt(
  p_debt_id     uuid,
  p_reason      text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_debt record;
  v_old_status text;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;

  select * into v_debt from public.customer_debts where id = p_debt_id for update;
  if v_debt.id is null then
    raise exception 'Hutang tidak ditemukan' using errcode = 'P0001';
  end if;

  v_old_status := v_debt.status;

  if v_debt.status = 'cancelled' then
    raise exception 'Hutang sudah dibatalkan' using errcode = 'P0001';
  end if;

  if v_debt.paid_amount > 0 then
    raise exception 'Hutang yang sudah dibayar sebagian tidak dapat dibatalkan. Sisa hutang harus dilunasi terlebih dahulu.' using errcode = 'P0001';
  end if;

  update public.customer_debts
    set status = 'cancelled',
        notes = coalesce(notes, '') || case when notes is null or notes = '' then '' else E'\n' end ||
                '[DIBATALKAN ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || p_reason,
        updated_at = now(),
        updated_by = p_created_by
    where id = p_debt_id;

  -- PENTING: JANGAN update customers.pending_debt di sini.
  -- Trigger trg_update_customer_debt_totals sudah mengurangi
  -- total_debt DAN pending_debt sebesar remaining_amount saat
  -- status berubah ke 'cancelled'. Update manual pada versi 0014
  -- menyebabkan pending_debt berkurang dua kali.

  insert into public.audit_logs (user_id, username, action, module, record_id, old_data, new_data)
  values (
    p_created_by,
    (select username from public.users where id = p_created_by),
    'DEBT_CANCELLED',
    'customer_debts',
    p_debt_id,
    jsonb_build_object('status', v_old_status, 'remaining_amount', v_debt.remaining_amount),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason)
  );

  return jsonb_build_object(
    'debt_id', p_debt_id,
    'status', 'cancelled',
    'old_status', v_old_status,
    'cancelled_at', now()
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. REKONSILIASI DATA — perbaiki nilai yang sudah salah
--    akibat bug double-subtract di versi sebelumnya.
--    Menghitung ulang total_debt & pending_debt dari data
--    aktual customer_debts.
-- ------------------------------------------------------------
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


