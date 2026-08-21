-- Simpan tanggal + jam untuk stock opname
alter table public.stock_opnames
  alter column opname_date type timestamptz using opname_date::timestamptz,
  alter column opname_date set default now();
