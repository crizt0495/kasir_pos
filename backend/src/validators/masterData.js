import { z } from 'zod';

const money = z.coerce.number().min(0, 'Tidak boleh negatif').max(1_000_000_000, 'Nilai terlalu besar');
const uuid = z.string().uuid('ID tidak valid').nullable().optional();

export const productSchema = z.object({
  sku: z
    .string({ required_error: 'SKU wajib diisi' })
    .trim()
    .min(1, 'SKU wajib diisi')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'SKU hanya boleh huruf, angka, titik, underscore, dan strip'),
  barcode: z.string().trim().max(64, 'Barcode maksimal 64 karakter').nullable().optional(),
  name: z.string({ required_error: 'Nama produk wajib diisi' }).trim().min(1, 'Nama produk wajib diisi').max(255),
  category_id: uuid,
  unit_id: uuid,
  purchase_price: money.default(0),
  sale_price: money.default(0),
  stock: z.coerce.number().min(0, 'Stok tidak boleh negatif').default(0),
  min_stock: z.coerce.number().min(0, 'Stok minimum tidak boleh negatif').default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  description: z.string().trim().max(1000).nullable().optional(),
  image_url: z.string().trim().url('URL gambar tidak valid').nullable().optional().or(z.literal('')),
});

export const categorySchema = z.object({
  name: z.string({ required_error: 'Nama kategori wajib diisi' }).trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const customerSchema = z.object({
  name: z.string({ required_error: 'Nama pelanggan wajib diisi' }).trim().min(1).max(255),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email('Email tidak valid').nullable().optional().or(z.literal('')),
  address: z.string().trim().max(500).nullable().optional(),
  birth_date: z.string().date('Tanggal lahir tidak valid').nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const supplierSchema = z.object({
  name: z.string({ required_error: 'Nama supplier wajib diisi' }).trim().min(1).max(255),
  contact_person: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email('Email tidak valid').nullable().optional().or(z.literal('')),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
