import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { resolveProvider } from './smsProviders.js';

const fmtRupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

/**
 * Bangun konten notifikasi dari data penjualan (murni, mudah di-test).
 * sale: detail penjualan { invoice_number, total, payment_method, created_at,
 *        customer: {name}, cashier: {username, profiles}, items: [...] }
 */
export function buildSaleNotification(sale) {
  const customerName = sale.customer?.name || 'Pelanggan Umum';
  const cashierName = sale.cashier?.profiles?.full_name || sale.cashier?.username || '-';
  const items = (sale.items || [])
    .map((it) => `- ${it.product?.name || 'Produk'} × ${Number(it.quantity)}`)
    .slice(0, 10);
  if ((sale.items || []).length > 10) items.push('...');

  const dateStr = new Date(sale.created_at).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const body =
    `Pelanggan: ${customerName}\nKasir: ${cashierName}\n\nProduk:\n${items.join('\n')}\n\n` +
    `Total: ${fmtRupiah(sale.total)}\nPembayaran: ${sale.payment_method || '-'}\nTanggal: ${dateStr}`;

  return {
    title: '🔔 Penjualan Baru',
    body,
    payload: {
      invoice_number: sale.invoice_number,
      sale_id: sale.id,
      total: sale.total,
      payment_method: sale.payment_method,
    },
  };
}

/** Kirim push ke satu subscription; return error message jika gagal, null jika sukses */
async function sendWebPush(subscription, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return 'VAPID keys belum dikonfigurasi';
  }
  // Import dinamis agar VAPID kosong tidak perlu library di-load
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const keys = subscription.keys || {};
  const sub = {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh || '', auth: keys.auth || '' },
  };
  if (!sub.keys.p256dh || !sub.keys.auth) return 'Subscription keys tidak lengkap';

  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return null;
  } catch (err) {
    // 404/410 → subscription sudah tidak valid
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'Subscription tidak valid lagi';
    return err?.message || 'Gagal mengirim push';
  }
}

/** Kirim pesan via Telegram Bot (fallback sederhana) */
async function sendTelegram(message) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 'Telegram tidak dikonfigurasi';
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: message }),
    });
    if (!res.ok) return `Telegram HTTP ${res.status}`;
    return null;
  } catch (err) {
    return err?.message || 'Gagal kirim Telegram';
  }
}

/** Kirim SMS ke HP owner via provider yang dikonfigurasi (Twilio / Fonnte) */
export async function sendSMS(message) {
  const provider = resolveProvider(env);
  if (!provider) return 'SMS tidak dikonfigurasi (isi SMS_TO + salah satu provider)';
  try {
    await provider.send(message, env);
    return null;
  } catch (err) {
    return `${provider.name}: ${err?.message || 'Gagal kirim'}`;
  }
}

async function logNotification(entry) {
  try {
    await supabase.from('notification_logs').insert(entry);
  } catch {
    /* log gagal tidak boleh mengganggu apa pun */
  }
}

/**
 * Kirim notifikasi penjualan ke Owner (semua user dengan permission
 * notifications.view) via Web Push + fallback Telegram.
 *
 * FIRE-AND-FORGET: fungsi ini TIDAK PERNAH melempar error. Kegagalan
 * notifikasi hanya dicatat di notification_logs (status failed) dan
 * TIDAK menyebabkan transaksi gagal / rollback.
 */
export async function notifyNewSale(sale) {
  try {
    const { title, body, payload } = buildSaleNotification(sale);

    // Pesan singkat untuk SMS (maks ~160 karakter, single SMS)
    const customerName = sale.customer?.name || 'Umum';
    const dateShort = new Date(sale.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const smsMessage =
      `POS: ${sale.invoice_number} Rp${Number(sale.total || 0).toLocaleString('id-ID')}` +
      ` ${sale.payment_method || '-'} ${customerName} ${dateShort}`;

    // Cari user yang punya permission notifications.view (Owner)
    const { data: userRows } = await supabase
      .from('user_roles')
      .select('user_id, role:roles!inner(role_permissions(permission:permissions(code)))')
      .eq('role.role_permissions.permission.code', 'notifications.view');

    const recipients = [...new Set((userRows || []).map((ur) => ur.user_id).filter(Boolean))];

    // 1) Web Push ke setiap subscription milik recipient
    let pushSent = 0;
    let pushFailed = 0;
    for (const userId of recipients) {
      const { data: subs } = await supabase
        .from('notification_subscriptions')
        .select('*')
        .eq('user_id', userId);

      for (const sub of subs || []) {
        const err = await sendWebPush(sub, { title, body, ...payload });
        if (err) {
          pushFailed += 1;
          await logNotification({
            user_id: userId,
            type: 'SALE',
            title,
            body,
            payload: { ...payload, endpoint: sub.endpoint },
            status: 'failed',
            error: String(err).slice(0, 500),
          });
        } else {
          pushSent += 1;
          await logNotification({
            user_id: userId,
            type: 'SALE',
            title,
            body,
            payload,
            status: 'sent',
          });
        }
      }
    }

    // 2) SMS ke HP Owner (via Twilio / Fonnte)
    const smsErr = await sendSMS(smsMessage);
    if (smsErr) {
      await logNotification({
        type: 'SALE',
        title: 'SMS',
        body: smsMessage,
        payload: { invoice_number: sale.invoice_number, sale_id: sale.id },
        status: 'failed',
        error: smsErr.slice(0, 500),
      });
    } else {
      await logNotification({
        type: 'SALE',
        title: 'SMS',
        body: smsMessage,
        payload: { invoice_number: sale.invoice_number, sale_id: sale.id },
        status: 'sent',
        error: null,
      });
    }

    // 3) Fallback Telegram (dikirim sekali ke chat owner)
    if (pushSent === 0 || env.TELEGRAM_BOT_TOKEN) {
      const tgErr = await sendTelegram(`${title}\n\n${body}`);
      if (!tgErr) {
        await logNotification({
          type: 'SALE',
          title,
          body,
          payload,
          status: 'sent',
          error: null,
        });
      }
    }
  } catch (err) {
    // Jangan pernah mengganggu alur transaksi
    try {
      await logNotification({
        type: 'SALE',
        title: '🔔 Penjualan Baru',
        body: `Penjualan ${sale?.invoice_number || ''} — gagal mengirim notifikasi`,
        payload: { sale_id: sale?.id, invoice_number: sale?.invoice_number },
        status: 'failed',
        error: String(err?.message || err).slice(0, 500),
      });
    } catch {
      /* abaikan */
    }
  }
}
