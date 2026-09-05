import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getPagination, buildPage, fetchPage, countSignature, invalidateCounts } from '../utils/pagination.js';
import { ok, created } from '../utils/response.js';
import { notFound, conflict } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

const PRODUCT_SELECT = '*, category:categories(id, name), unit:product_units(id, name, short_name)';

// ============================================================
// PRODUCTS
// ============================================================

export const listProducts = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = safeSearch(req.query.search);
  const { category_id, status, sort } = req.query;

  const sortable = { name: 'name', created_at: 'created_at', sale_price: 'sale_price', stock: 'stock', purchase_price: 'purchase_price' };
  const order = sortable[sort] || 'name';

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('products').select(select, opts);
      if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`);
      if (category_id) query = query.eq('category_id', category_id);
      if (status) query = query.eq('status', status);
      return query;
    },
    select: PRODUCT_SELECT,
    signature: countSignature('products', [q, category_id, status]),
    page,
    pageSize,
    orderBy: order,
    ascending: req.query.order !== 'desc',
  });
  return ok(res, result);
});

export const getProduct = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Produk tidak ditemukan');
  return ok(res, data);
});

export const getProductByBarcode = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('barcode', req.params.barcode)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Produk tidak ditemukan');
  return ok(res, data);
});

export const createProduct = asyncHandler(async (req, res) => {
  const body = req.body;

  // Cek duplikat dengan .eq() terpisah — aman, tanpa interpolasi string filter
  const skuDup = await supabase.from('products').select('id').eq('sku', body.sku).maybeSingle();
  const barcodeDup = body.barcode
    ? await supabase.from('products').select('id').eq('barcode', body.barcode).maybeSingle()
    : { data: null, error: null };
  if (skuDup.data || barcodeDup?.data) throw conflict('SKU atau barcode sudah digunakan', 'PRODUCT_DUPLICATE');

  const { data: product, error } = await supabase
    .from('products')
    .insert({ ...body, barcode: body.barcode || null, created_by: req.user.id, updated_by: req.user.id })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'PRODUCT_CREATED',
    module: 'products',
    recordId: product.id,
    newData: { sku: product.sku, name: product.name, sale_price: product.sale_price },
    req,
  });
  invalidateCounts('inventory_products');
  invalidateCounts('products');
  return created(res, product, 'Produk berhasil dibuat');
});

export const updateProduct = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const body = req.body;

  const { data: existing } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Produk tidak ditemukan');

  const { data: product, error } = await supabase
    .from('products')
    .update({ ...body, barcode: body.barcode || null, updated_by: req.user.id })
    .eq('id', id)
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'PRODUCT_UPDATED',
    module: 'products',
    recordId: id,
    oldData: { name: existing.name, sale_price: existing.sale_price, stock: existing.stock },
    newData: { name: product.name, sale_price: product.sale_price },
    req,
  });
  invalidateCounts('inventory_products');
  invalidateCounts('products');
  return ok(res, product, 'Produk berhasil diperbarui');
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const { data: existing } = await supabase.from('products').select('id, name').eq('id', id).maybeSingle();
  if (!existing) throw notFound('Produk tidak ditemukan');

  const { count } = await supabase
    .from('inventory_movements')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);
  if (count > 0) {
    throw conflict('Produk memiliki riwayat transaksi, nonaktifkan produk saja', 'PRODUCT_HAS_HISTORY');
  }

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'PRODUCT_DELETED',
    module: 'products',
    recordId: id,
    newData: { name: existing.name },
    req,
  });
  invalidateCounts('inventory_products');
  invalidateCounts('products');
  return ok(res, null, 'Produk berhasil dihapus');
});

// ============================================================
// UNITS (satuan produk)
// ============================================================

export const listUnits = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('product_units').select('*').order('name');
  if (error) throw error;
  return ok(res, data || []);
});

export const createUnit = asyncHandler(async (req, res) => {
  const { data: dup } = await supabase.from('product_units').select('id').eq('name', req.body.name).maybeSingle();
  if (dup) throw conflict('Nama satuan sudah ada', 'UNIT_TAKEN');

  const { data: unit, error } = await supabase
    .from('product_units')
    .insert({ name: req.body.name, short_name: req.body.short_name })
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'UNIT_CREATED', module: 'products', recordId: unit.id, newData: { name: unit.name }, req });
  return created(res, unit, 'Satuan berhasil dibuat');
});

// ============================================================
// CATEGORIES
// ============================================================

export const listCategories = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query, 20);
  const q = (req.query.search || '').trim();
  const { status } = req.query;

  const result = await fetchPage({
    buildQuery: (select, opts) => {
      let query = supabase.from('categories').select(select, opts);
      if (q) query = query.ilike('name', `%${q}%`);
      if (status) query = query.eq('status', status);
      return query;
    },
    select: 'id, name, description, status, created_at',
    signature: countSignature('categories', [q, status]),
    page,
    pageSize,
    orderBy: 'name',
    ascending: true,
  });
  return ok(res, result);
});

export const createCategory = asyncHandler(async (req, res) => {
  const { data: dup } = await supabase.from('categories').select('id').eq('name', req.body.name).maybeSingle();
  if (dup) throw conflict('Nama kategori sudah ada', 'CATEGORY_TAKEN');

  const { data: category, error } = await supabase
    .from('categories')
    .insert({ ...req.body, created_by: req.user.id, updated_by: req.user.id })
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'CATEGORY_CREATED', module: 'categories', recordId: category.id, newData: { name: category.name }, req });
  return created(res, category, 'Kategori berhasil dibuat');
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('categories').select('id, name').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Kategori tidak ditemukan');

  const { data: category, error } = await supabase
    .from('categories')
    .update({ ...req.body, updated_by: req.user.id })
    .eq('id', req.params.id)
    .select('*')
    .single();
  if (error) throw error;

  await writeAudit({
    user: req.user,
    action: 'CATEGORY_UPDATED',
    module: 'categories',
    recordId: category.id,
    oldData: { name: existing.name },
    newData: { name: category.name },
    req,
  });
  return ok(res, category, 'Kategori berhasil diperbarui');
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { data: existing } = await supabase.from('categories').select('id, name').eq('id', req.params.id).maybeSingle();
  if (!existing) throw notFound('Kategori tidak ditemukan');

  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', req.params.id);
  if (count > 0) throw conflict('Kategori masih digunakan produk', 'CATEGORY_IN_USE');

  const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
  if (error) throw error;

  await writeAudit({ user: req.user, action: 'CATEGORY_DELETED', module: 'categories', recordId: req.params.id, newData: { name: existing.name }, req });
  return ok(res, null, 'Kategori berhasil dihapus');
});
