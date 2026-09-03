import { z } from 'zod';

const roleRef = z.union([z.string().uuid(), z.string().min(1)]);

export const createUserSchema = z.object({
  username: z
    .string({ required_error: 'Username wajib diisi' })
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username hanya boleh huruf, angka, titik, garis bawah, dan strip'),
  full_name: z.string({ required_error: 'Nama lengkap wajib diisi' }).trim().min(1, 'Nama lengkap wajib diisi').max(255),
  email: z.string().trim().email('Email tidak valid').nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(30).nullable().optional(),
  password: z
    .string({ required_error: 'Password wajib diisi' })
    .min(8, 'Password minimal 8 karakter')
    .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
    .regex(/[0-9]/, 'Password harus mengandung angka'),
  roles: z.array(roleRef).min(1, 'Pilih minimal satu role'),
  is_active: z.boolean().default(true),
  must_change_password: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username hanya boleh huruf, angka, titik, garis bawah, dan strip')
    .optional(),
  full_name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email('Email tidak valid').nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(30).nullable().optional(),
  roles: z.array(roleRef).min(1, 'Pilih minimal satu role').optional(),
  is_active: z.boolean().optional(),
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
    .regex(/[0-9]/, 'Password harus mengandung angka')
    .nullable()
    .optional(),
});

export const createRoleSchema = z.object({
  name: z.string({ required_error: 'Nama role wajib diisi' }).trim().min(1).max(100),
  code: z
    .string({ required_error: 'Kode role wajib diisi' })
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Kode hanya huruf kecil, angka, dan underscore'),
  description: z.string().trim().max(500).nullable().optional(),
  permission_codes: z.array(z.string()).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  permission_codes: z.array(z.string()).optional(),
});

export const setPermissionsSchema = z.object({
  permission_codes: z.array(z.string()).default([]),
});

export const resetPasswordSchema = z.object({
  password: z
    .string({ required_error: 'Password wajib diisi' })
    .min(8, 'Password minimal 8 karakter')
    .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
    .regex(/[0-9]/, 'Password harus mengandung angka'),
  must_change_password: z.boolean().default(true),
});

const settingsStoreValue = z
  .object({
    name: z.string().trim().min(1, 'Nama toko wajib diisi').max(255),
    phone: z.string().trim().max(30).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    logo_url: z.string().trim().url('URL logo tidak valid').nullable().optional().or(z.literal('')),
    npwp: z.string().trim().max(50).nullable().optional(),
  })
  .passthrough();

const settingsPosValue = z
  .object({
    default_payment_method: z.enum(['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET']),
    receipt_width: z.enum(['58mm', '80mm']),
    auto_print_receipt: z.boolean().nullable().optional(),
  })
  .passthrough();

const settingsTaxValue = z
  .object({
    enabled: z.boolean().nullable().optional(),
    percentage: z.coerce.number().min(0, 'Persentase pajak tidak boleh negatif').max(100, 'Persentase pajak maksimal 100'),
  })
  .passthrough();

const settingsInventoryValue = z
  .object({
    allow_negative_stock: z.boolean().nullable().optional(),
    low_stock_threshold: z.coerce.number().min(0, 'Ambang stok tidak boleh negatif'),
  })
  .passthrough();

const settingsSessionValue = z
  .object({
    session_timeout_minutes: z.coerce
      .number()
      .int('Session timeout harus bilangan bulat')
      .min(1, 'Session timeout minimal 1 menit')
      .max(10080, 'Session timeout maksimal 10080 menit'),
  })
  .passthrough();

const settingsInvoiceValue = z
  .object({
    prefix: z
      .string({ required_error: 'Prefix nomor transaksi wajib diisi' })
      .trim()
      .min(1, 'Prefix nomor transaksi wajib diisi')
      .max(10)
      .regex(/^[A-Z0-9]+$/, 'Prefix hanya huruf kapital dan angka'),
  })
  .passthrough();

const settingsNotificationValue = z
  .object({
    enabled: z.boolean().default(false),
    owner_phone: z
      .string()
      .trim()
      .max(30, 'Nomor HP maksimal 30 karakter')
      .nullable()
      .optional(),
    telegram_chat_id: z
      .string()
      .trim()
      .max(50, 'Telegram Chat ID maksimal 50 karakter')
      .nullable()
      .optional(),
    channels: z
      .object({
        web_push: z.boolean().default(true),
        sms: z.boolean().default(false),
        telegram: z.boolean().default(false),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const settingsValueSchemas = {
  store: settingsStoreValue,
  pos: settingsPosValue,
  tax: settingsTaxValue,
  inventory: settingsInventoryValue,
  user_session: settingsSessionValue,
  invoice: settingsInvoiceValue,
  notification: settingsNotificationValue,
};

export const settingsUpdateSchema = z
  .array(
    z.object({
      key: z.string().min(1).max(50),
      value: z.unknown(),
    })
  )
  .superRefine((items, ctx) => {
    items.forEach((item, index) => {
      const valueSchema = settingsValueSchemas[item.key];
      if (!valueSchema) return;
      const result = valueSchema.safeParse(item.value);
      if (result.success) {
        item.value = result.data;
        return;
      }
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'value', ...issue.path],
          message: issue.message,
        });
      }
    });
  });
