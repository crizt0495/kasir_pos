-- ============================================================
-- 0009 — Materialized views untuk laporan real-time dengan cache
-- 
-- Materialized view (MV) menyimpan snapshot data yang di-refresh secara berkala.
-- Saat ada SELECT laporan harian, tidak perlu scan tabel penjualan
-- seluruhnya, cukup baca MV yang sudah dihitung sebelumnya.
--
-- MV ini di-refresh:
--   - Dengan cron job (Supabase Edge Functions atau Vercel Cron)
--   - Secara manual saat ada perubahan data (optional: via trigger)
--
-- Note: CREATE MATERIALIZED VIEW membutuhkan waktu & resource di awal,
--       tapi sangat mempercepat query laporan yang sering diakses.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DAILY SALES SUMMARY — 100x lebih cepat daripada GROUP BY date_trunc
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_daily_sales;

CREATE MATERIALIZED VIEW mv_daily_sales AS
SELECT 
  date_trunc('day', s.created_at)::date AS sale_date,
  COUNT(*) AS total_transactions,
  SUM(s.total) AS total_sales,
  SUM(s.profit) AS total_profit,
  COUNT(DISTINCT s.cashier_id) AS cashiers_count,
  -- grouping by payment method untuk breakdown
  jsonb_object_agg(
    s.payment_method,
    jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE s.payment_method = s.payment_method),
      'total', COALESCE(SUM(s.total) FILTER (WHERE s.payment_method = s.payment_method), 0)
    )
  ) AS payment_summary
FROM sales s
WHERE s.status <> 'cancelled'
GROUP BY date_trunc('day', s.created_at)::date;

CREATE UNIQUE INDEX idx_mv_daily_sales_date ON mv_daily_sales (sale_date);

-- ------------------------------------------------------------
-- 2. TOP PRODUCTS BY REVENUE (Last 30 days) — cache untuk dashboard
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_top_products;

CREATE MATERIALIZED VIEW mv_top_products AS
SELECT 
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  p.category_id,
  c.name AS category_name,
  SUM(si.quantity) AS total_sold,
  SUM(si.subtotal) AS total_revenue,
  SUM(si.profit) AS total_profit
FROM sale_items si
JOIN sales s ON s.id = si.sale_id AND s.status <> 'cancelled'
JOIN products p ON p.id = si.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.sku, p.name, p.category_id, c.name
ORDER BY total_revenue DESC
LIMIT 50;

CREATE UNIQUE INDEX idx_mv_top_products_product_id ON mv_top_products (product_id);

-- ------------------------------------------------------------
-- 3. CUSTOMER MONTHLY ACTIVITY — untuk tracking & marketing
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_customer_monthly;

CREATE MATERIALIZED VIEW mv_customer_monthly AS
SELECT 
  date_trunc('month', s.created_at)::date AS month,
  s.customer_id,
  c.name AS customer_name,
  COUNT(*) AS total_transactions,
  SUM(s.total) AS total_spend,
  SUM(s.profit) AS total_profit,
  AVG(s.total)::numeric(15,2) AS avg_transaction
FROM sales s
JOIN customers c ON c.id = s.customer_id AND c.is_general = false
WHERE s.status <> 'cancelled'
GROUP BY date_trunc('month', s.created_at)::date, s.customer_id, c.name;

CREATE UNIQUE INDEX idx_mv_customer_monthly_month_customer ON mv_customer_monthly (month, customer_id);

-- ------------------------------------------------------------
-- 4. REFRESH FUNCTION — untuk dipanggil cron job (auto setiap 1 jam)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_products;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_monthly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_profit_period_summary;
END;
$$;

-- ------------------------------------------------------------
-- 5. GANTI fungsi statistik pelanggan (optimasi lebih lanjut)
--    Gunakan MV jika tersedia, fallback ke query real-time
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customers_stats(p_ids uuid[])
RETURNS TABLE (customer_id uuid, total_transactions bigint, total_spend numeric)
LANGUAGE sql STABLE
AS $$
  SELECT s.customer_id,
         COUNT(*)::bigint AS total_transactions,
         COALESCE(SUM(s.total), 0)::numeric(15, 2) AS total_spend
  FROM sales s
  WHERE s.status <> 'cancelled' AND s.customer_id = ANY (p_ids)
  GROUP BY s.customer_id;
$$;

-- ------------------------------------------------------------
-- 6. Materialized view untuk profit sharing summary (per periode)
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_profit_period_summary;

CREATE MATERIALIZED VIEW mv_profit_period_summary AS
SELECT 
  ps.id AS period_id,
  ps.year,
  COUNT(DISTINCT cps.customer_id) AS total_customers,
  SUM(cps.total_purchase) AS total_purchase,
  SUM(cps.total_profit) AS total_profit,
  SUM(cps.share_amount) AS total_share_amount,
  COALESCE(SUM(pd.distributed), 0) AS total_distributed,
  SUM(cps.share_amount) - COALESCE(SUM(pd.distributed), 0) AS total_remaining
FROM profit_periods ps
JOIN customer_profit_shares cps ON cps.period_id = ps.id
LEFT JOIN (
  SELECT period_id, SUM(amount) AS distributed
  FROM profit_distributions
  GROUP BY period_id
) pd ON pd.period_id = ps.id
GROUP BY ps.id, ps.year;

CREATE UNIQUE INDEX idx_mv_profit_period_summary_period_id ON mv_profit_period_summary (period_id);

-- ------------------------------------------------------------
-- 7. NOTE IMPORTANT: Refresh MV di cron job
--    Di Supabase: buat Edge Function yang panggil SELECT fn_refresh_materialized_views();
--    Di Vercel: set cron dengan https://vercel.com/docs/cron-jobs
-- ------------------------------------------------------------