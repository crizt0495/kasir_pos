import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ required_error: 'Username wajib diisi' })
    .trim()
    .min(1, 'Username wajib diisi'),
  password: z.string({ required_error: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
  rememberMe: z.boolean().optional().default(false),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: 'Password saat ini wajib diisi' }).min(1),
    newPassword: z
      .string({ required_error: 'Password baru wajib diisi' })
      .min(8, 'Password minimal 8 karakter')
      .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
      .regex(/[0-9]/, 'Password harus mengandung angka'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });
