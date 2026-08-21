import { z } from 'zod';

export const adjustStockSchema = z.object({
  product_id: z.string().uuid('Produk tidak valid'),
  quantity: z.coerce
    .number({ required_error: 'Jumlah wajib diisi' })
    .refine((v) => v !== 0, 'Jumlah penyesuaian tidak boleh 0'),
  reason: z.string({ required_error: 'Alasan wajib diisi' }).trim().min(3, 'Alasan minimal 3 karakter').max(500),
});

export const opnameCreateSchema = z.object({
  opname_date: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal tidak valid')
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid('Produk tidak valid'),
        system_stock: z.coerce.number().default(0),
        physical_stock: z.coerce.number().min(0, 'Stok fisik tidak boleh negatif'),
        reason: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1, 'Minimal satu produk'),
});

export const opnameUpdateSchema = z.object({
  opname_date: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal tidak valid')
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid('Produk tidak valid'),
        system_stock: z.coerce.number().default(0),
        physical_stock: z.coerce.number().min(0, 'Stok fisik tidak boleh negatif'),
        reason: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1, 'Minimal satu produk'),
});
