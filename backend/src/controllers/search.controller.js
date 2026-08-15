import { supabase } from '../config/supabase.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safeSearch } from '../utils/sanitize.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const q = safeSearch(req.query.q);
  const can = (code) => req.user.permissions.has(code);

  if (!q) return ok(res, { products: [], sales: [], customers: [], suppliers: [] });

  const tasks = [];

  if (can('products.view') || can('pos.access')) {
    tasks.push(
      supabase
        .from('products')
        .select('id, name, sku, barcode, sale_price, stock')
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
        .order('name')
        .limit(6)
        .then(({ data }) => ({ products: data || [] }))
    );
  } else {
    tasks.push(Promise.resolve({ products: [] }));
  }

  if (can('sales.view')) {
    tasks.push(
      supabase
        .from('sales')
        .select('id, invoice_number, total, created_at')
        .ilike('invoice_number', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(6)
        .then(({ data }) => ({ sales: data || [] }))
    );
  } else {
    tasks.push(Promise.resolve({ sales: [] }));
  }

  if (can('customers.view')) {
    tasks.push(
      supabase
        .from('customers')
        .select('id, name, phone')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('name')
        .limit(4)
        .then(({ data }) => ({ customers: data || [] }))
    );
  } else {
    tasks.push(Promise.resolve({ customers: [] }));
  }

  if (can('suppliers.view')) {
    tasks.push(
      supabase
        .from('suppliers')
        .select('id, name, phone')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('name')
        .limit(4)
        .then(({ data }) => ({ suppliers: data || [] }))
    );
  } else {
    tasks.push(Promise.resolve({ suppliers: [] }));
  }

  const results = await Promise.all(tasks);
  const merged = { products: [], sales: [], customers: [], suppliers: [] };
  results.forEach((r) => Object.assign(merged, r));
  return ok(res, merged);
});
