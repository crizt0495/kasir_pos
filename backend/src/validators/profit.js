import { z } from 'zod';

export const createPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const updatePeriodSchema = z.object({
  status: z.enum(['open', 'closed']),
});

export const distributeSchema = z.object({
  period_id: z.string().uuid('Periode tidak valid'),
  customer_id: z.string().uuid('Pelanggan tidak valid'),
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  note: z.string().max(500).optional().nullable(),
});

export const subscribeSchema = z.object({
  endpoint: z.string().min(10, 'Endpoint subscription tidak valid'),
  keys: z
    .object({
      p256dh: z.string().optional().nullable(),
      auth: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const unsubscribeSchema = z.object({
  endpoint: z.string().min(10, 'Endpoint subscription tidak valid'),
});
