import { z } from 'zod';

const uuid = z.string().uuid('ID tidak valid');
const money = z.coerce.number().min(0, 'Tidak boleh negatif').max(1_000_000_000, 'Nilai terlalu besar');

export const debtCreateSchema = z.object({
  customer_id: uuid,
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  due_date: z.string().min(1, 'Jatuh tempo wajib diisi'),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const debtPaySchema = z.object({
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
});
