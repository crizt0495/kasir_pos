import { z } from 'zod';

const money = z.coerce.number().min(0, 'Tidak boleh negatif').max(1_000_000_000, 'Nilai terlalu besar');
const uuid = z.string().uuid('ID tidak valid');
const dateSchema = z.string().date('Tanggal tidak valid');

export const createDebtSchema = z.object({
  customer_id: uuid,
  amount: money,
  due_date: dateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const payDebtSchema = z.object({
  debt_id: uuid.optional(),
  amount: money,
});

export const debtQuerySchema = z.object({
  status: z.enum(['pending', 'paid', 'partial', 'overdue', 'cancelled']).optional(),
  customer_id: uuid.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});