import { supabase } from '../config/supabase.js';
import { notifyNewSale } from './notificationService.js';
import { writeAudit } from './auditService.js';
import { AppError, extractPgMessage } from '../utils/errors.js';

const SALE_DETAIL_SELECT =
  '*, customer:customers(id, name, phone, email, address), ' +
  'cashier:users!sales_cashier_id_fkey(id, username, profiles(full_name)), ' +
  'items:sale_items(*, product:products(id, name, sku, unit:product_units(short_name))), ' +
  'payments:sale_payments(*), ' +
  'debts:customer_debts(id, amount, paid_amount, remaining_amount, status, due_date, sale_id)';

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
export async function createSaleRecord(cashierUserId, body, { offlineId } = {}) {
  const hasDebt = Boolean(body.record_debt);

  // Idempotensi offline: offline_id yang SUDAH pernah diproses → kembalikan
  // transaksi yang sudah tersimpan, tanpa membuat duplikat (respons hilang
  // saat offline-sync / timeout akan mengirim offline_id yang sama lagi).
  if (offlineId) {
    const pre = await supabase
      .from('sales')
      .select('id')
      .eq('offline_id', offlineId)
      .maybeSingle();
    if (!pre.error && pre.data) {
      const existing = await fetchSaleDetail(pre.data.id);
      return {
        sale_id: existing.id,
        invoice_number: existing.invoice_number,
        subtotal: existing.subtotal,
        discount: existing.discount,
        tax: existing.tax,
        additional_cost: existing.additional_cost,
        total: existing.total,
        total_cost: existing.total_cost,
        profit: existing.profit,
        payment_method: existing.payment_method,
        cash_received: existing.payments?.[0]?.cash_received ?? null,
        change: existing.payments?.[0]?.change_amount ?? 0,
        sale: existing,
        idempotent: true,
      };
    }
  }

  const baseArgs = {
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
  };

  // Selalu kirim p_offline_id (null saat online) supaya panggilan tak ambigu
  // antara overload 13-arg (0030) & 14-arg (0036). Tanpa itu, saat kedua
  // migrasi ter-apply, Postgres balas `42725 could not choose the best
  // candidate function` untuk setiap penjualan ONLINE. DB tanpa 0036 tetap
  // terlayani via fallback PGRST202 di bawah.
  let { data: result, error } = await supabase.rpc('fn_create_sale', {
    ...baseArgs,
    p_record_debt: body.record_debt ?? null,
    p_offline_id: offlineId ?? null,
  });

  if (isFunctionNotFound(error)) {
    // 14-arg (0036) belum ter-apply → coba 13-arg (0030)
    console.warn('[createSale] fn_create_sale 14-arg (0036) tidak ditemukan, retry ke 13-arg');
    ({ data: result, error } = await supabase.rpc('fn_create_sale', {
      ...baseArgs,
      p_record_debt: body.record_debt ?? null,
    }));
  }

  // Fallback: jika migration 0013 belum di-apply, tanpa p_allow_partial
  if (isFunctionNotFound(error)) {
    console.warn('[createSale] fn_create_sale 13-arg (0030) tidak ditemukan, retry ke 12-arg (0013)');
    ({ data: result, error } = await supabase.rpc('fn_create_sale', baseArgs));
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

const EDIT_ALLOWED_STATUSES = ['completed'];

/**
 * Koreksi transaksi penjualan (Poin 5). Dipakai route PUT /api/sales/:id/edit.
 *
 * Prosedur (merujuk pola fn_create_sale / fn_refund_sale):
 *  1. Validasi: transaksi ada, status completed, belum ada retur.
 *  2. Hitung delta stok per produk (qtyLama - qtyBaru); positif = stok balik.
 *  3. Terapkan stok + catat inventory_movements (type SALE, ref sale_edit).
 *  4. Batalkan hutang lama yang tertaut transaksi ini (status → cancelled,
 *     trigger recompute customers.total_debt/pending_debt otomatis).
 *  5. Tulis ulang sale_items, sale_payments, sales, dan hutang baru bila ada.
 *  6. Audit SALE_EDITED + penyesuaian profit share.
 *
 * body: items, reason (wajib), customer_id?, discount?, tax?, additional_cost?,
 *       payment_method?, cash_received?, record_debt?
 * return: { sale_id, invoice_number, subtotal, total, total_cost, profit,
 *           payment_method, cash_received, change, debt_amount, sale }
 */
export async function editSaleRecord(userId, saleId, body) {
  const sale = await fetchSaleDetail(saleId);
  if (!sale) throw new AppError('Transaksi tidak ditemukan', { code: 'NOT_FOUND', status: 404 });
  if (!EDIT_ALLOWED_STATUSES.includes(sale.status)) {
    throw new AppError('Hanya transaksi berstatus selesai yang dapat dikoreksi', {
      code: 'BAD_REQUEST',
      status: 400,
    });
  }

  const { data: returns } = await supabase.from('returns').select('id').eq('sale_id', saleId).limit(1);
  if (returns && returns.length > 0) {
    throw new AppError('Transaksi yang sudah diretur tidak dapat dikoreksi', {
      code: 'BAD_REQUEST',
      status: 400,
    });
  }

  const oldItems = sale.items || [];
  const oldPayments = sale.payments || [];

  // --- Muat data produk & setting stok negatif ---
  const productIds = [...new Set(body.items.map((i) => i.product_id))];
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, stock, purchase_price')
    .in('id', productIds);
  if (productsError) throw productsError;

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  for (const item of body.items) {
    if (!productMap.has(item.product_id)) {
      throw new AppError('Produk tidak ditemukan', { code: 'BAD_REQUEST', status: 400 });
    }
  }

  const { data: invSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'inventory')
    .maybeSingle();
  const allowNegative = Boolean(invSetting?.value?.allow_negative_stock);

  // --- Delta stok per produk: positif = stok kembali ke gudang ---
  const oldQty = {};
  for (const it of oldItems) oldQty[it.product_id] = (oldQty[it.product_id] || 0) + Number(it.quantity);
  const newQty = {};
  for (const it of body.items) newQty[it.product_id] = (newQty[it.product_id] || 0) + Number(it.quantity);

  const affected = [...new Set([...Object.keys(oldQty), ...Object.keys(newQty)])];
  for (const pid of affected) {
    const current = Number(productMap.get(pid)?.stock ?? 0);
    const stockChange = (oldQty[pid] || 0) - (newQty[pid] || 0);
    if (stockChange < 0 && current + stockChange < 0 && !allowNegative) {
      throw new AppError(`Stok ${productMap.get(pid)?.name || 'produk'} tidak cukup untuk koreksi (sisa ${current})`, {
        code: 'BAD_REQUEST',
        status: 400,
      });
    }
  }

  // --- Hitung nilai baru (mirror fn_create_sale) ---
  let subtotal = 0;
  let totalCost = 0;
  let computedProfit = 0;
  const newLines = body.items.map((it) => {
    const prod = productMap.get(it.product_id);
    const qty = Number(it.quantity);
    const price = Number(it.price);
    const disc = Number(it.discount || 0);
    const cost = Number(prod?.purchase_price || 0);
    const lineSubtotal = price * qty - disc;
    const lineProfit = lineSubtotal - cost * qty;
    subtotal += lineSubtotal;
    totalCost += cost * qty;
    computedProfit += lineProfit;
    return { product_id: it.product_id, quantity: qty, price, discount: disc, subtotal: lineSubtotal, cost_price: cost, profit: lineProfit };
  });

  const discount = Number(body.discount || 0);
  const tax = Number(body.tax || 0);
  const additionalCost = Number(body.additional_cost || 0);
  const total = subtotal - discount + tax + additionalCost;
  const paymentMethod = body.payment_method || sale.payment_method || 'CASH';
  const cashReceived = body.cash_received ?? oldPayments[0]?.cash_received ?? null;
  const customerId = body.customer_id ? body.customer_id : sale.customer_id;

  let debtAmount = 0;
  let debtDueDate = null;
  if (paymentMethod === 'CASH' && cashReceived !== null && cashReceived < total) {
    debtAmount = Math.max(total - cashReceived, 0);
  } else if (body.record_debt && Number(body.record_debt.amount) > 0) {
    debtAmount = Number(body.record_debt.amount);
    debtDueDate = body.record_debt.due_date || null;
  } else if (paymentMethod !== 'CASH' && cashReceived !== null && cashReceived < total) {
    throw new AppError('Jumlah bayar kurang dari total transaksi', { code: 'BAD_REQUEST', status: 400 });
  }

  if (paymentMethod === 'CASH' && cashReceived !== null && !body.record_debt && cashReceived < total && debtAmount === 0) {
    throw new AppError('Jumlah bayar kurang dari total transaksi', { code: 'BAD_REQUEST', status: 400 });
  }

  const changeAmount = cashReceived === null ? 0 : Math.max(cashReceived - total, 0);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // --- 1) Terapkan delta stok + catat inventory_movements ---
  for (const pid of affected) {
    const stockChange = (oldQty[pid] || 0) - (newQty[pid] || 0);
    if (stockChange === 0) continue;
    const { data: live } = await supabase.from('products').select('stock').eq('id', pid).single();
    const before = Number(live?.stock ?? 0);
    const after = before + stockChange;
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: after, updated_by: userId })
      .eq('id', pid);
    if (stockError) throw stockError;
    const { error: moveError } = await supabase.from('inventory_movements').insert({
      product_id: pid,
      type: 'SALE',
      quantity: stockChange,
      before_stock: before,
      after_stock: after,
      reference_id: saleId,
      reference_type: 'sale_edit',
      notes: `Koreksi transaksi ${sale.invoice_number} (${body.reason})`,
      created_by: userId,
    });
    if (moveError) throw moveError;
  }

  // --- 2) Batalkan hutang lama tertaut transaksi ini ---
  const { error: cancelDebtError } = await supabase
    .from('customer_debts')
    .update({ status: 'cancelled', updated_at: now, updated_by: userId })
    .eq('sale_id', saleId)
    .in('status', ['pending', 'partial', 'overdue']);
  if (cancelDebtError) throw cancelDebtError;

  // --- 3) Tulis ulang sale_items ---
  if (oldItems.length > 0) {
    const { error: deleteItemsError } = await supabase.from('sale_items').delete().eq('sale_id', saleId);
    if (deleteItemsError) throw deleteItemsError;
  }
  if (newLines.length > 0) {
    const { error: insertItemsError } = await supabase
      .from('sale_items')
      .insert(newLines.map((l) => ({ sale_id: saleId, ...l })));
    if (insertItemsError) throw insertItemsError;
  }

  // --- 4) Tulis ulang sale_payments ---
  if (oldPayments.length > 0) {
    const { error: payError } = await supabase
      .from('sale_payments')
      .update({ amount: total, payment_method: paymentMethod, cash_received: cashReceived, change_amount: changeAmount })
      .eq('sale_id', saleId);
    if (payError) throw payError;
  } else {
    const { error: payError } = await supabase.from('sale_payments').insert({
      sale_id: saleId,
      amount: total,
      payment_method: paymentMethod,
      cash_received: cashReceived,
      change_amount: changeAmount,
    });
    if (payError) throw payError;
  }

  // --- 5) Update baris sales ---
  const editedNote = sale.notes ? `${sale.notes} [Koreksi: ${body.reason}]` : body.reason;
  const { error: saleError } = await supabase
    .from('sales')
    .update({
      customer_id: customerId,
      subtotal,
      discount,
      tax,
      additional_cost: additionalCost,
      total,
      total_cost: totalCost,
      profit: computedProfit,
      payment_method: paymentMethod,
      notes: editedNote,
      updated_at: now,
      updated_by: userId,
    })
    .eq('id', saleId);
  if (saleError) throw saleError;

  // --- 6) Catat hutang baru bila ada (trigger recompute otomatis) ---
  const debtNotes = body.record_debt?.notes || `Hutang dari transaksi ${sale.invoice_number} (koreksi)`;
  if (debtAmount > 0 && customerId) {
    const { error: insertDebtError } = await supabase.from('customer_debts').insert({
      customer_id: customerId,
      amount: debtAmount,
      paid_amount: 0,
      remaining_amount: debtAmount,
      due_date: debtDueDate || today,
      status: 'pending',
      notes: debtNotes,
      created_by: userId,
      updated_by: userId,
      sale_id: saleId,
    });
    if (insertDebtError) throw insertDebtError;
  }

  // --- 7) Sesuaikan bagi hasil (delta) — gagal tidak memblokir koreksi ---
  try {
    if (customerId) {
      await supabase.rpc('fn_upsert_profit_share', {
        p_customer_id: customerId,
        p_date: today,
        p_purchase_delta: total - Number(sale.total || 0),
        p_profit_delta: computedProfit - Number(sale.profit || 0),
      });
    }
  } catch {}

  // --- 8) Audit ---
  const oldSummary = {
    customer_id: sale.customer_id,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    additional_cost: sale.additional_cost,
    total: sale.total,
    total_cost: sale.total_cost,
    profit: sale.profit,
    payment_method: sale.payment_method,
    items: (sale.items || []).map((i) => ({ product_id: i.product_id, quantity: i.quantity, price: i.price, discount: i.discount })),
  };
  await writeAudit({
    user: { id: userId },
    action: 'SALE_EDITED',
    module: 'sales',
    recordId: saleId,
    oldData: oldSummary,
    newData: {
      reason: body.reason,
      customer_id: customerId,
      subtotal,
      discount,
      tax,
      additional_cost: additionalCost,
      total,
      total_cost: totalCost,
      profit: computedProfit,
      payment_method: paymentMethod,
      cash_received: cashReceived,
      debt_amount: debtAmount,
      items: newLines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, price: l.price, discount: l.discount })),
    },
  }).catch(() => {});

  const updated = await fetchSaleDetail(saleId);
  return {
    sale_id: saleId,
    invoice_number: sale.invoice_number,
    subtotal,
    discount,
    tax,
    additional_cost: additionalCost,
    total,
    total_cost: totalCost,
    profit: computedProfit,
    payment_method: paymentMethod,
    cash_received: cashReceived,
    change: changeAmount,
    debt_amount: debtAmount,
    sale: updated,
  };
}