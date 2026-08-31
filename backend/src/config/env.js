import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env dari backend/ lalu root (yang pertama ditemukan dipakai)
dotenv.config({ path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../.env')] });

function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV !== 'test') {
    throw new Error(`Environment variable ${name} wajib diisi. Lihat .env.example`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3001),
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  JWT_REMEMBER_EXPIRES_IN: process.env.JWT_REMEMBER_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 1200),
  LOGIN_RATE_LIMIT_MAX: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  // Notifikasi Web Push (PWA) — opsional, jika kosong push dilewati
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  // Fallback notifikasi Telegram — opsional
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  // SMS ke HP Owner (via Twilio atau Fonnte) — opsional
  SMS_PROVIDER: process.env.SMS_PROVIDER || '',   // 'twilio' atau 'fonnte'
  SMS_ACCOUNT_SID: process.env.SMS_ACCOUNT_SID || '',
  SMS_AUTH_TOKEN: process.env.SMS_AUTH_TOKEN || '',
  SMS_FROM: process.env.SMS_FROM || '',
  SMS_API_TOKEN: process.env.SMS_API_TOKEN || '',
  SMS_TO: process.env.SMS_TO || '',
};

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
