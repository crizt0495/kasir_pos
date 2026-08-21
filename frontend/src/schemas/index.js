import { z } from 'zod';

const money = z.coerce.number().min(0, 'Tidak boleh negatif').max(1_000_000_000, 'Nilai terlalu besar');

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
  rememberMe: z.boolean().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
    newPassword: z
      .string()
      .min(8, 'Password minimal 8 karakter')
      .regex(/[a-zA-Z]/, 'Harus mengandung huruf')
      .regex(/[0-9]/, 'Harus mengandung angka'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

export const productSchema = z
  .object({
    sku: z.string().trim().min(1, 'SKU wajib diisi').max(50),
    barcode: z.string().trim().max(64).optional().or(z.literal('')),
    name: z.string().trim().min(1, 'Nama produk wajib diisi').max(255),
    category_id: z.string().uuid().optional().or(z.literal('')),
    unit_id: z.string().uuid().optional().or(z.literal('')),
    purchase_price: money,
    sale_price: money,
    stock: z.coerce.number().min(0, 'Stok tidak boleh negatif'),
    min_stock: z.coerce.number().min(0, 'Stok min tidak boleh negatif'),
    status: z.enum(['active', 'inactive']),
    description: z.string().trim().max(1000).optional(),
    image_url: z.string().trim().url('URL gambar tidak valid').optional().or(z.literal('')),
  })
  .refine((d) => Number(d.sale_price) > Number(d.purchase_price), {
    message: 'Harga jual harus lebih tinggi dari harga beli',
    path: ['sale_price'],
  });

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(100),
  description: z.string().trim().max(500).optional(),
  status: z.enum(['active', 'inactive']),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(255),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  birth_date: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Nama supplier wajib diisi').max(255),
  contact_person: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(['active', 'inactive']),
});

export const userSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Huruf, angka, titik, garis bawah, strip'),
  full_name: z.string().trim().min(1, 'Nama lengkap wajib diisi').max(255),
  email: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[a-zA-Z]/, 'Harus mengandung huruf')
    .regex(/[0-9]/, 'Harus mengandung angka')
    .optional()
    .or(z.literal('')),
  roles: z.array(z.string()).min(1, 'Pilih minimal satu role'),
  is_active: z.boolean(),
});

export const roleSchema = z.object({
  name: z.string().trim().min(1, 'Nama role wajib diisi').max(100),
  code: z
    .string()
    .trim()
    .min(2, 'Kode minimal 2 karakter')
    .regex(/^[a-z0-9_]+$/, 'Huruf kecil, angka, underscore'),
  description: z.string().trim().max(500).optional(),
});

export const adjustStockSchema = z.object({
  product_id: z.string().uuid('Produk tidak valid'),
  quantity: z.coerce.number().refine((v) => v !== 0, 'Jumlah tidak boleh 0'),
  reason: z.string().trim().min(3, 'Alasan minimal 3 karakter').max(500),
});

export const expenseSchema = z.object({
  expense_date: z.string().optional(),
  category: z.string().trim().min(1, 'Kategori wajib diisi').max(100),
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  description: z.string().trim().max(1000).optional(),
  payment_method: z.enum(['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET']),
});
