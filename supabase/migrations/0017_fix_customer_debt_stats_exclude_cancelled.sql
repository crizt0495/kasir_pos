-- ============================================================
-- FIX fn_get_customer_debt_stats: exclude cancelled debts
-- ============================================================
-- Bug: fn_get_customer_debt_stats returned total_debt and total_records
--      including cancelled debts. Fixed to match the semantics in
--      0015_fix_cancel_debt_double_subtract.sql where cancelled debts
--      are excluded from customer.totals via trigger and reconciliation.

create or replace function public.fn_get_customer_debt_stats(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_total numeric := 0;
  v_pending numeric := 0;
  v_paid numeric := 0;
  v_overdue numeric := 0;
  v_total_count int := 0;
  v_pending_count int := 0;
  v_due_soon int := 0;
begin
  select
    coalesce(sum(case when status != 'cancelled' then amount else 0 end), 0),
    coalesce(sum(case when status in ('pending', 'partial', 'overdue') then remaining_amount else 0 end), 0),
    coalesce(sum(case when status = 'paid' then amount else 0 end), 0),
    coalesce(sum(case when status = 'overdue' then remaining_amount else 0 end), 0),
    count(*) filter (where status != 'cancelled'),
    count(*) filter (where status in ('pending', 'partial', 'overdue'))
  into v_total, v_pending, v_paid, v_overdue, v_total_count, v_pending_count
  from public.customer_debts
  where customer_id = p_customer_id;

  select count(*)
    into v_due_soon
  from public.customer_debts
  where customer_id = p_customer_id
    and status in ('pending', 'partial')
    and due_date <= current_date + interval '7 days';

  return jsonb_build_object(
    'total_debt', v_total,
    'pending_debt', v_pending,
    'paid_debt', v_paid,
    'overdue_debt', v_overdue,
    'total_records', v_total_count,
    'pending_records', v_pending_count,
    'due_soon_records', v_due_soon
  );
end;
$$;

grant execute on function public.fn_get_customer_debt_stats(uuid) to service_role;