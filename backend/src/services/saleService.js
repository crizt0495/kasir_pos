import { supabase } from '../config/supabase.js';
import { notifyNewSale } from './notificationService.js';
import { AppError, extractPgMessage } from '../utils/errors.js';

const SALE_DETAIL_SELECT =
  '*, customer:customers(id, name, phone, email, address), ' +
  'cashier:users!sales_cashier_id_fkey(id, username, profiles(full_name)), ' +
  'items:sale_items(*, product:products(id, name, sku, unit:product_units(short_name))), ' +
  'payments:sale_payments(*)';

/** Ambil detail lengkap transaksi (dipakai struk & notifikasi). */
export async function fetchSaleDetail(id) {
  const { data, error } = await supabase.from('sales').select(SALE_DETAIL_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

function handleRpcError(error) {
  if (error) {
    throw new AppError(extractPgMessage(error), { code: 'BAD_REQUEST', status: 400 });
  }
}

function isFunctionNotFound(e) {
  return (
    e &&
    (String(e.code || '') === 'PGRST202' ||
      String(e.message || '').includes('Could not find') ||
      String(e.details || '').includes('schema cache') ||
      String(e.message || '').includes('schema cache'))
  );
}

/**
 * Catat transaksi penjualan ke database (RPC fn_create_sale, atomik) lalu
 * kirim notifikasi ke Owner. Dipakai oleh route POST /api/sales dan
 * POST /api/sync-offline-transactions (antrian transaksi offline).
 *
 * body: payload valid dari createSaleSchema (items, customer_id, discount,
 *       tax, additional_cost, payment_method, cash_received, notes,
 *       session_id, record_debt).
 * return: { sale_id, invoice_number, subtotal, discount, tax,
 *           additional_cost, total, total_cost, profit, payment_method,
 *           cash_received, change, debt_id, debt_amount, sale }
 */
export async function createSaleRecord(cashierUserId, body) {
  const hasDebt = Boolean(body.record_debt);

  let { data: result, error } = await supabase.rpc('fn_create_sale', {
    p_cashier_id: cashierUserId,
    p_created_by: cashierUserId,
    p_items: body.items,
    p_customer_id: body.customer_id || null,
    p_discount: body.discount || 0,
    p_tax: body.tax || 0,
    p_additional_cost: body.additional_cost || 0,
    p_payment_method: body.payment_method || 'CASH',
    p_cash_received: body.cash_received ?? null,
    p_notes: body.notes || null,
    p_session_id: body.session_id || null,
    p_allow_partial: hasDebt,
    p_record_debt: body.record_debt ?? null,
  });

  // Fallback: jika migration 0013 belum di-apply, tanpa p_allow_partial
  if (isFunctionNotFound(error)) {
    console.warn('[createSale] fn_create_sale versi 0014 (dgn p_record_debt) tidak ditemukan, retry ke versi 0013 (p_allow_partial)');
    const retry = await supabase.rpc('fn_create_sale', {
      p_cashier_id: cashierUserId,
      p_created_by: cashierUserId,
      p_items: body.items,
      p_customer_id: body.customer_id || null,
      p_discount: body.discount || 0,
      p_tax: body.tax || 0,
      p_additional_cost: body.additional_cost || 0,
      p_payment_method: body.payment_method || 'CASH',
      p_cash_received: body.cash_received ?? null,
      p_notes: body.notes || null,
      p_session_id: body.session_id || null,
      p_allow_partial: hasDebt,
    });
    result = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[createSale] RPC error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      body: { customer_id: body.customer_id, payment_method: body.payment_method, cash_received: body.cash_received, items_count: body.items?.length },
    });
  }

  handleRpcError(error);

  const sale = await fetchSaleDetail(result.sale_id);

  // Notifikasi ke HP Owner (Web Push PWA). notifyNewSale dijamin TIDAK pernah
  // melempar error — kegagalan notif tidak menggagalkan/rollback transaksi.
  await notifyNewSale(sale).catch(() => {});

  return { ...result, sale };
}