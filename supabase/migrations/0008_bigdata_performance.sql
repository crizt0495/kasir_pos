-- ============================================================
-- 0008 — Optimasi performa tabel besar (big data)
-- Fokus: index untuk pola search ilike '%..%' (trigram), sorting
-- yang di-whitelist backend, dan filter yang sering dipakai.
-- Semua CREATE INDEX IF NOT EXISTS — aman dijalankan berulang
-- dan tidak mengubah struktur/data tabel yang sudah ada.
--
-- CATATAN PROD: pada tabel yang sudah sangat besar, jalankan
--CREATE INDEX CONCURRENTLY secara manual (di luar transaksi)
-- jika migrasi ini dijalankan saat sistem live.
-- ============================================================

-- ------------------------------------------------------------
-- SEARCH (ilike %..%) — GIN trigram; btree tidak terpakai utk leading wildcard
-- ------------------------------------------------------------
-- Produk dicari by name/sku/barcode di halaman Produk & Stok
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON products USING gin (barcode gin_trgm_ops);

-- Penjualan dicari by invoice_number (tabel paling besar, tumbuh terus)
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number_trgm ON sales USING gin (invoice_number gin_trgm_ops);

-- Pembelian dicari by purchase_number/invoice_number
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number_trgm ON purchases USING gin (invoice_number gin_trgm_ops);

-- Pelanggan & supplier dicari by nama/telepon/email/kontak
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON customers USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);

-- Pengeluaran dicari by deskripsi (search baru difungsikan di backend)
CREATE INDEX IF NOT EXISTS idx_expenses_description_trgm ON expenses USING gin (description gin_trgm_ops);

-- ------------------------------------------------------------
-- SORTING yang di-whitelist endpoint (hindari full sort scan)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_total ON sales (total DESC);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_sale_price ON products (sale_price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products (stock);

-- ------------------------------------------------------------
-- FILTER eq yang sering dipakai
-- ------------------------------------------------------------
-- Audit log: dropdown filter action pada tabel yang tumbuh tanpa batas
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

-- FK yang dipakai JOIN/laporan namun belum berindex
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items (product_id);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON return_items (sale_item_id);

-- ------------------------------------------------------------
-- Agregat statistik pelanggan untuk daftar Customers.
-- Menggantikan embed seluruh riwayat sales per pelanggan
-- (payload tak terbatas) dengan 1 query GROUP BY terhadap
-- hanya id pelanggan pada halaman aktif.
-- SECURITY INVOKER: dijalankan service_role backend (bypass RLS),
-- hanya SELECT — tidak menaikkan hak akses siapa pun.
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
