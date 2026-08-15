import { z } from 'zod';

export const openSessionSchema = z.object({
  opening_balance: z.coerce.number().min(0, 'Saldo awal tidak boleh negatif').default(0),
});

export const closeSessionSchema = z.object({
  actual_cash: z.coerce.number().min(0, 'Kas aktual tidak boleh negatif'),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const cashTransactionSchema = z.object({
  session_id: z.string().uuid('Sesi kas tidak valid'),
  type: z.enum(['IN', 'OUT']),
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const expenseSchema = z.object({
  expense_date: z.string().date('Tanggal tidak valid').optional(),
  category: z.string({ required_error: 'Kategori wajib diisi' }).trim().min(1).max(100),
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  description: z.string().trim().max(1000).nullable().optional(),
  payment_method: z
    .enum(['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'])
    .default('CASH'),
  session_id: z.string().uuid().nullable().optional(),
});
