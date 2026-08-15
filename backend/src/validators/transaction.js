import { z } from 'zod';

const money = z.coerce.number().min(0, 'Tidak boleh negatif');

export const saleItemSchema = z.object({
  product_id: z.string().uuid('Produk tidak valid'),
  quantity: z.coerce.number().positive('Qty harus lebih dari 0'),
  price: money,
  discount: money.default(0),
});

export const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1, 'Keranjang tidak boleh kosong'),
  customer_id: z.string().uuid().nullable().optional(),
  discount: money.default(0),
  tax: money.default(0),
  additional_cost: money.default(0),
  payment_method: z
    .enum(['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'])
    .default('CASH'),
  cash_received: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  session_id: z.string().uuid().nullable().optional(),
});

export const refundItemSchema = z.object({
  sale_item_id: z.string().uuid('Item tidak valid'),
  quantity: z.coerce.number().positive('Qty retur harus lebih dari 0'),
});

export const refundSaleSchema = z.object({
  items: z.array(refundItemSchema).min(1, 'Pilih minimal satu item'),
  reason: z.string().trim().min(3, 'Alasan retur wajib diisi (min 3 karakter)').max(1000),
  session_id: z.string().uuid().nullable().optional(),
});

export const purchaseItemSchema = z.object({
  product_id: z.string().uuid('Produk tidak valid'),
  quantity: z.coerce.number().positive('Qty harus lebih dari 0'),
  cost_price: money,
});

export const createPurchaseSchema = z.object({
  supplier_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().trim().max(100).nullable().optional(),
  purchase_date: z.string().date('Tanggal tidak valid').optional(),
  discount: money.default(0),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Daftar produk tidak boleh kosong'),
});
