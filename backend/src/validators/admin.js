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

export const settingsUpdateSchema = z.object({
  key: z.string().min(1).max(50),
  value: z.record(z.any()),
}).array();
